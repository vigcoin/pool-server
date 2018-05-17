import * as net from 'net';
import { Socket } from 'net';
import { promisify } from 'util';
import { Logger } from '@vigcoin/logger';
import { Handler } from './socket-handler';

import { RingBuffer } from './ring-buffer';
import { BlockTemplate } from './block-template';
import { v1 } from 'uuid';
import { MiningServer } from './server';
import { RedisClient } from 'redis';

import * as bignum from 'bignum';

export class Miner {
  public attributes: any = {};
  public trust: any = {};
  handler: Handler;
  public validJobs: any = [];
  shareTimeRing: RingBuffer;
  lastShareTime = Date.now() / 1000;
  public lastBeat = Date.now();
  logger: Logger;

  constructor(attributes: any, handler: Handler, logger: Logger) {
    // ['id', 'login', 'pass', 'ip', 'noRetarget', 'difficuty']
    this.attributes = attributes;

    // Vardiff related variables
    this.shareTimeRing = new RingBuffer(16);
    this.handler = handler;
    this.logger = logger;
    this.trust = {};
  }

  public timedout() {
    const { login, ip } = this.attributes;
    this.logger.append(
      'warn',
      'pool',
      'Miner timed out and disconnected %s@%s',
      [login, ip]
    );
  }
  heartbeat() {
    this.lastBeat = Date.now();
  }

  setNewDiff(newDiff: number, attributes: any) {
    const { difficulty, login } = attributes;

    newDiff = Math.round(newDiff);
    if (difficulty === newDiff) return;
    this.logger.append(
      'info',
      'pool',
      'Retargetting difficulty %d to %d for %s',
      [difficulty, newDiff, login]
    );
    this.attributes.pendingDifficulty = newDiff;
    this.pushMessage('job', this.getJob());
  }

  retarget(now: any) {
    const { difficulty, options: config, VarDiff } = this.attributes;
    const { varDiff: options } = config.poolServer;
    const sinceLast = now - this.lastShareTime;
    const decreaser = sinceLast > VarDiff.tMax;
    const avg = this.shareTimeRing.avg(decreaser ? sinceLast : 0);
    let redirected = this.isRedirected(avg, options, this.attributes);

    if (redirected === false) {
      return false;
    }

    const { newDiff } = redirected;

    this.setNewDiff(newDiff, this.attributes);
    this.shareTimeRing.clear();
    if (decreaser) this.lastShareTime = now;
  }

  public isRedirected(avg: number, options: any, attributes: any) {
    let direction;
    let newDiff;
    const { difficulty, VarDiff } = attributes;
    newDiff = options.targetTime / avg * difficulty;

    if (avg > VarDiff.tMax && difficulty > options.minDiff) {
      newDiff = newDiff > options.minDiff ? newDiff : options.minDiff;
      direction = -1;
    } else if (avg < VarDiff.tMin && difficulty < options.maxDiff) {
      newDiff = newDiff < options.maxDiff ? newDiff : options.maxDiff;
      direction = 1;
    } else {
      return false;
    }

    if (Math.abs(newDiff - difficulty) / difficulty * 100 > options.maxJump) {
      const change = options.maxJump / 100 * difficulty * direction;
      newDiff = difficulty + change;
    }
    return { newDiff, direction };
  }

  getTargetHex() {
    const { diff1, pendingDifficulty } = this.attributes;
    if (pendingDifficulty) {
      this.attributes.lastDifficulty = this.attributes.difficulty;
      this.attributes.difficulty = this.attributes.pendingDifficulty;
      this.attributes.pendingDifficulty = null;
    }

    const padded = new Buffer(32);
    padded.fill(0);

    const diffBuff = diff1.div(this.attributes.difficulty).toBuffer();
    diffBuff.copy(padded, 32 - diffBuff.length);

    const buff = padded.slice(0, 4);
    let buffArray = new Buffer(buff.length);
    buff.copy(buffArray);
    buffArray.reverse();
    const buffReversed = new Buffer(buffArray);
    this.attributes.target = buffReversed.readUInt32BE(0);
    const hex = buffReversed.toString('hex');
    return hex;
  }

  pushMessage(method: string, params: any) {
    this.handler.sendMessage(method, params);
  }

  getJob() {
    const {
      score,
      diffHex,
      difficulty,
      lastBlockHeight,
      pendingDifficulty,
    } = this.attributes;
    const currentBlockTemplate = BlockTemplate.currentBlockTemplate;

    if (!currentBlockTemplate) {
      return {
        blob: '',
        job_id: '',
        target: '',
      };
    }

    if (lastBlockHeight === currentBlockTemplate.height && !pendingDifficulty) {
      return {
        blob: '',
        job_id: '',
        target: '',
      };
    }

    const blob = currentBlockTemplate.nextBlob();
    this.attributes.lastBlockHeight = currentBlockTemplate.height;
    const target = this.getTargetHex();

    const newJob: any = {
      id: v1(),
      extraNonce: currentBlockTemplate.extraNonce,
      height: currentBlockTemplate.height,
      difficulty,
      score,
      diffHex,
      submissions: [],
    };

    this.validJobs.push(newJob);
    if (this.validJobs.length > 4) {
      this.validJobs.shift();
    }

    return {
      blob: blob,
      job_id: newJob.id,
      target: target,
    };
  }

  isValidJob(jobId: string) {
    const jobs = this.validJobs.filter(function(job: any) {
      return job.id === jobId;
    });

    return jobs.length;
  }

  invalidSubmit(params: any, server: MiningServer, heading: string) {
    const { ip } = this.attributes;
    MiningServer.perIPStats[ip] = { validShares: 0, invalidShares: 999999 };
    server.checkBan(false, {});
    this.logger.append(
      'warn',
      'pool',
      heading +
        ': ' +
        JSON.stringify(params) +
        ' from ' +
        this.getUserAddress(),
      []
    );
  }

  getWoker() {
    const { ip, id, login: address } = this.attributes;
    return {
      id,
      ip,
      address,
    };
  }

  trustCheck(config: any) {
    const {
      shareTrustEnabled,
      shareAccepted,
      shareTrustStepFloat,
      shareTrustMinFloat,
      penalty,
    } = config;
    const { login: address, ip, trust } = this.attributes;
    if (shareTrustEnabled) {
      if (shareAccepted) {
        trust.probability -= shareTrustStepFloat;
        if (trust.probability < shareTrustMinFloat)
          trust.probability = shareTrustMinFloat;
        trust.penalty--;
        trust.threshold--;
      } else {
        trust.probability = 1;
        trust.penalty = penalty;
        this.logger.append('warn', 'pool', 'Share trust broken by %s@%s', [
          address,
          ip,
        ]);
      }
    }
  }

  getUserAddress() {
    const { ip, login } = this.attributes;
    return ' ' + login + '@' + ip;
  }

  async recordShare(
    redis: RedisClient,
    coin: string,
    address: string,
    job: any,
    dateNow: number
  ) {
    const hset = promisify(redis.hset).bind(redis);
    const hincrby = promisify(redis.hincrby).bind(redis);
    const zadd = promisify(redis.zadd).bind(redis);

    await hincrby(
      [coin, 'shares', 'roundCurrent'].join(':'),
      address,
      job.score
    );
    await hincrby(
      [coin, 'workers', address].join(':'),
      'hashes',
      job.difficulty
    );
    await hset(
      [coin, 'workers', address].join(':'),
      'lastShare',
      dateNow / 1000
    );
    await zadd(
      [coin, 'hashrate'].join(':'),
      dateNow / 1000,
      [job.difficulty, address, dateNow].join(':')
    );
  }
}
