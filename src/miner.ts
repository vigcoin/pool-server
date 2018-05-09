import * as net from "net";
import { Socket } from "net";
import { promisify } from "util";
import { Logger } from '@vigcoin/logger';
import { Handler } from './socket-handler';

import { RingBuffer } from "./ring-buffer";
import { BlockTemplate } from "./block-template";
import { v1 } from "uuid";

export class Miner {
  public attributes: any = {};
  handler: Handler
  validJobs: any = [];
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
  }

  timedout() {
    const { login, ip } = this.attributes;
    this.logger.append('warn', 'pool', 'Miner timed out and disconnected %s@%s', [login, ip]);
  }
  heartbeat() {
    this.lastBeat = Date.now();
  }

  setNewDiff(newDiff: number) {
    const { VarDiff, difficulty, login } = this.attributes;

    newDiff = Math.round(newDiff);
    if (difficulty === newDiff) return;
    this.logger.append('info', 'pool', 'Retargetting difficulty %d to %d for %s', [difficulty, newDiff, login]);
    this.attributes.pendingDifficulty = newDiff;
    // this.pushMessage('job', this.getJob());
  }
  retarget(now: any) {

    const { difficulty, options: config, VarDiff } = this.attributes;

    const { varDiff: options } = config;

    const sinceLast = now - this.lastShareTime;
    const decreaser = sinceLast > VarDiff.tMax;

    const avg = this.shareTimeRing.avg(decreaser ? sinceLast : 0);
    let newDiff;

    let direction;

    if (avg > VarDiff.tMax && difficulty > options.minDiff) {
      newDiff = options.targetTime / avg * difficulty;
      newDiff = newDiff > options.minDiff ? newDiff : options.minDiff;
      direction = -1;
    }
    else if (avg < VarDiff.tMin && difficulty < options.maxDiff) {
      newDiff = options.targetTime / avg * difficulty;
      newDiff = newDiff < options.maxDiff ? newDiff : options.maxDiff;
      direction = 1;
    }
    else {
      return;
    }

    if (Math.abs(newDiff - difficulty) / difficulty * 100 > options.maxJump) {
      const change = options.maxJump / 100 * difficulty * direction;
      newDiff = difficulty + change;
    }

    this.setNewDiff(newDiff);
    this.shareTimeRing.clear();
    if (decreaser) this.lastShareTime = now;
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
    let buffArray = buff.toJSON();
    buffArray.reverse();
    const buffReversed = new Buffer(buffArray);
    this.attributes.target = buffReversed.readUInt32BE(0);
    const hex = buffReversed.toString('hex');
    return hex;
  }

  pushMessage(method, params) {
    this.handler.sendMessage(method, params);
  };


  getJob() {
    const { score, diffHex, difficulty, lastBlockHeight, pendingDifficulty } = this.attributes;
    const currentBlockTemplate = BlockTemplate.currentBlockTemplate;

    if (lastBlockHeight === currentBlockTemplate.height && !pendingDifficulty) {
      return {
        blob: '',
        job_id: '',
        target: ''
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
      submissions: []
    };

    this.validJobs.push(newJob);

    if (this.validJobs.length > 4)
      this.validJobs.shift();

    return {
      blob: blob,
      job_id: newJob.id,
      target: target
    };
  }

  isValidJob(jobId: string) {
    const jobs = this.validJobs.filter(function (job: any) {
      return job.id === jobId;
    });

    return jobs.length;
  }

  // checkBan(validShare: boolean) {

  //   const { id, ip, banningEnabled, config, login } = this.attributes;
  //   if (!banningEnabled) return;

  //   // Init global per-IP shares stats
  //   if (!Handler.perIPStats[ip]) {
  //     Handler.perIPStats[ip] = { validShares: 0, invalidShares: 0 };
  //   }

  //   const stats = Handler.perIPStats[ip];
  //   validShare ? stats.validShares++ : stats.invalidShares++;
  //   if (stats.validShares + stats.invalidShares >= config.banning.checkThreshold) {
  //     if (stats.invalidShares / stats.validShares >= config.banning.invalidPercent / 100) {
  //       this.logger.append('warn', 'pool', 'Banned %s@%s', [login, ip]);
  //       Handler.banned[ip] = Date.now();
  //       delete Handler.connectedMiners[id];
  //       process.send({ type: 'banIP', ip });
  //     }
  //     else {
  //       stats.invalidShares = 0;
  //       stats.validShares = 0;
  //     }
  //   }
  // }
}
