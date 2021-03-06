import { Socket } from 'net';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { Miner } from './miner';

import * as cnUtil from '@vigcoin/cryptonote-util';

import { cryptonight as cryptoNight } from '@vigcoin/multi-hashing';

import { RedisClient } from 'redis';
import { promisify } from 'util';

import { v1 } from 'uuid';

import { BlockTemplate } from './block-template';
import { MiningServer } from './server';

let scoreTime: any;
let lastChecked = 0;

const bignum = require('bignum');

const diff1 = bignum(
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  16
);

export class Handler {
  config: any;
  buffer: Buffer;
  socket: Socket;
  logger: Logger;
  logName: string = 'pool';
  port: number;
  difficulty: number;
  addressBase58Prefix: any;
  req: PoolRequest;
  redis: RedisClient;

  shareTrustEnabled: any;
  shareTrustStepFloat: any;
  shareTrustMinFloat: any;

  server: MiningServer;

  public static httpResponse = ' 200 OK\nContent-Type: text/plain\nContent-Length: 20\n\nmining server online';

  constructor(
    server: MiningServer,
    config: any,
    port: number,
    difficulty: number,
    socket: Socket,
    logger: Logger,
    req: PoolRequest,
    redis: RedisClient
  ) {
    this.server = server;
    this.shareTrustEnabled =
      config.poolServer.shareTrust && config.poolServer.shareTrust.enabled;
    this.shareTrustStepFloat = this.shareTrustEnabled
      ? config.poolServer.shareTrust.stepDown / 100
      : 0;
    this.shareTrustMinFloat = this.shareTrustEnabled
      ? config.poolServer.shareTrust.min / 100
      : 0;

    this.req = req;
    this.config = config;
    this.port = port;
    this.difficulty = difficulty;
    this.socket = socket;
    this.logger = logger;
    this.buffer = new Buffer('');
    this.redis = redis;
    this.addressBase58Prefix = cnUtil.address_decode(
      new Buffer(this.config.poolServer.poolAddress)
    );

    socket.on('data', async (data: Buffer) => {
      await this.onData(data);
    });
  }

  async recordShareData(
    miner: Miner,
    job: any,
    shareDiff: String,
    blockCandidate: any,
    hashHex: string,
    shareType: string,
    blockTemplate: BlockTemplate | null
  ) {
    const hget = promisify(this.redis.hget).bind(this.redis);
    const hset = promisify(this.redis.hset).bind(this.redis);
    const zadd = promisify(this.redis.zadd).bind(this.redis);
    const hincrby = promisify(this.redis.hincrby).bind(this.redis);
    const rename = promisify(this.redis.rename).bind(this.redis);
    const hgetall = promisify(this.redis.hgetall).bind(this.redis);

    const dateNow = Date.now();
    const dateNowSeconds = dateNow / 1000;
    const { login: address, ip } = miner.attributes;

    //Weighting older shares lower than newer ones to prevent pool hopping
    if (this.config.poolServer.slushMining.enabled) {
      if (
        lastChecked + this.config.poolServer.slushMining.lastBlockCheckRate <=
          dateNowSeconds ||
        lastChecked == 0
      ) {
        try {
          const result = await hget(
            [this.config.coin, 'stats'].join(':'),
            'lastBlockFound'
          );
          scoreTime = (result / 1000) | 0; //scoreTime could potentially be something else than the beginning of the current round, though this would warrant changes in api.js (and potentially the redis db)
          lastChecked = dateNowSeconds;
        } catch (e) {
          this.logger.append(
            'error',
            'pool',
            'Unable to determine the timestamp of the last block found',
            []
          );
          return;
        }
      }

      job.score =
        job.difficulty *
        Math.pow(
          Math.E,
          (scoreTime - dateNowSeconds) /
            this.config.poolServer.slushMining.weight
        ); //Score Calculation
      this.logger.append(
        'info',
        'pool',
        'Submitted score ' +
          job.score +
          ' with difficulty ' +
          job.difficulty +
          ' and the time ' +
          scoreTime,
        []
      );
    } else {
      job.score = job.difficulty;
    }

    try {
      await miner.recordShare(
        this.redis,
        this.config.coin,
        address,
        job,
        dateNow
      );
      if (blockCandidate) {
        await hset(
          [this.config.coin, 'stats', 'lastBlockFound'].join(':'),
          Date.now()
        );
        await rename(
          [this.config.coin, 'shares', 'roundCurrent'].join(':'),
          this.config.coin + ':shares:round' + job.height
        );
        const workerShares = await hgetall(
          [this.config.coin, 'shares', 'round', job.height].join(':')
        );
        const totalShares = Object.keys(workerShares).reduce(function(p, c) {
          return p + parseInt(workerShares[c]);
        }, 0);

        this.updateBlockCandiates(
          this.redis,
          blockTemplate,
          job,
          hashHex,
          totalShares
        );
      }
    } catch (e) {
      this.logger.append(
        'error',
        'pool',
        'Failed to insert share data into redis %j \n',
        [e]
      );
    }
    this.logger.append(
      'info',
      'pool',
      'Accepted %s share at difficulty %d/%d from %s@%s',
      [shareType, job.difficulty, shareDiff, address, ip]
    );
  }

  async processShare(
    miner: Miner,
    job: any,
    blockTemplate: BlockTemplate,
    params: any
  ) {
    console.log(params);
    const { nonce, result: resultHash } = params;
    const { login, ip } = miner.attributes;

    // nonce: string, resultHash: string

    const shareBuffer = blockTemplate.shareBuffer(job, params, this.logger);

    console.log(shareBuffer);
    console.log(miner.trust);
    let convertedBlob;
    let hash;
    let shareType: any;

    if (
      this.shareTrustEnabled &&
      miner.trust.threshold <= 0 &&
      miner.trust.penalty <= 0 &&
      Math.random() > miner.trust.probability
    ) {
      hash = new Buffer(resultHash, 'hex');
      shareType = 'trusted';
    } else {
      convertedBlob = cnUtil.convert_blob(shareBuffer);
      console.log(convertedBlob);
      hash = cryptoNight(convertedBlob);
      hash = new Buffer(hash, 'hex');
      shareType = 'valid';
    }

    console.log('shareType:' + shareType);
    console.log('hash:' + hash.toString('hex'));
    console.log('result:' + resultHash);

    if (hash.toString('hex') !== resultHash) {
      this.logger.append('warn', 'pool', 'Bad hash from miner %s@%s', [
        login,
        ip,
      ]);
      return false;
    }

    let hashArray = new Buffer(hash.length);
    hash.copy(hashArray);
    hashArray.reverse();
    const hashNum = bignum.fromBuffer(new Buffer(hashArray));
    const hashDiff = diff1.div(hashNum);

    if (hashDiff.ge(blockTemplate.difficulty)) {
      try {
        const result = await this.req.daemon('/', 'submitblock', [
          shareBuffer.toString('hex'),
        ]);
        const blockFastHash = cnUtil.get_block_id(shareBuffer).toString('hex');
        this.logger.append(
          'info',
          'pool',
          'Block %s found at height %d by miner %s@%s - submit result: %j',
          [blockFastHash.substr(0, 6), job.height, login, ip, result]
        );
        await this.recordShareData(
          miner,
          job,
          hashDiff.toString(),
          true,
          blockFastHash,
          shareType,
          blockTemplate
        );
        BlockTemplate.jobRefresh(false, this.req, this.logger, this.config);
      } catch (e) {
        this.logger.append(
          'error',
          'pool',
          'Error submitting block at height %d from %s@%s, share type: "%s" - %j',
          [job.height, login, ip, shareType, e]
        );
        await this.recordShareData(
          miner,
          job,
          hashDiff.toString(),
          false,
          '',
          shareType,
          null
        );
      }
    } else if (hashDiff.lt(job.difficulty)) {
      this.logger.append(
        'warn',
        'pool',
        'Rejected low difficulty share of %s from %s@%s',
        [hashDiff.toString(), login, ip]
      );
      return false;
    } else {
      await this.recordShareData(
        miner,
        job,
        hashDiff.toString(),
        false,
        '',
        shareType,
        null
      );
    }
    return true;
  }

  async onSubmitJob(miner: Miner, params: any, json: any) {
    miner.heartbeat();
    const job = this.checkSubmit(miner, params, json);

    if (!job) {
      this.logger.append('warn', 'pool', 'Check job failed!', []);
      return;
    }

    job.submissions.push(params.nonce);

    const blockTemplate = BlockTemplate.getJobTemplate(job);

    if (!blockTemplate) {
      this.reply(json, 'Block expired', null);
      return;
    }
    const shareAccepted = await this.processShare(
      miner,
      job,
      blockTemplate,
      params
    );

    this.submit(shareAccepted, miner, json);
  }

  public async updateBlockCandiates(
    redis: RedisClient,
    blockTemplate: any | null,
    job: any,
    hashHex: string,
    totalShares: number
  ) {
    if (!blockTemplate) {
      return;
    }
    try {
      const zadd = promisify(redis.zadd).bind(redis);
      await zadd(
        [this.config.coin, 'blocks', 'candidates'].join(':'),
        job.height,
        [
          hashHex,
          Date.now() / 1000,
          blockTemplate.difficulty,
          totalShares,
        ].join(':')
      );
    } catch (e) {
      this.logger.append(
        'error',
        'pool',
        'Failed inserting block candidate %s \n %j',
        [hashHex, e]
      );
    }
  }

  public onLogin(json: any, params: any) {
    let login = params.login;
    if (!login) {
      this.reply(json, 'missing login', null);
      return null;
    }

    const { difficulty, noRetarget } = this.changeDiff(
      login,
      this.config.poolServer,
      this.difficulty
    );

    if (this.addressBase58Prefix !== cnUtil.address_decode(new Buffer(login))) {
      this.reply(json, 'invalid address used for login', null);
      return;
    }
    const id = v1();
    let trust = null;

    if (this.shareTrustEnabled) {
      trust = {
        threshold: this.config.poolServer.shareTrust.threshold,
        probability: 1,
        penalty: 0,
      };
    }
    let { varDiff, banning } = this.config.poolServer;
    const variance = varDiff.variancePercent / 100 * varDiff.targetTime;
    let varDiffNew = {
      variance: variance,
      bufferSize: varDiff.retargetTime / varDiff.targetTime * 4,
      tMin: varDiff.targetTime - variance,
      tMax: varDiff.targetTime + variance,
      maxJump: varDiff.maxJump,
    };

    const banningEnabled = banning && banning.enabled;
    const miner = new Miner(
      {
        score: 1,
        diffHex: 'e',
        id,
        login,
        pass: params.pass,
        ip: this.socket.remoteAddress,
        difficulty,
        noRetarget,
        VarDiff: varDiffNew,
        diff1,
        // currentBlockTemplate,
        options: this.config.poolServer,
        banningEnabled,
        trust,
      },
      this,
      this.logger
    );
    MiningServer.connectedMiners[id] = miner;

    this.reply(json, null, {
      id,
      job: miner.getJob(),
      status: 'OK',
    });
    this.logger.append('info', 'pool', 'Miner connected %s@%s', [
      params.login,
      this.socket.remoteAddress,
    ]);
    return miner;
  }

  public changeDiff(login: any, poolServer: any, difficulty: number) {
    // let difficulty = this.difficulty;
    let noRetarget = false;

    if (poolServer.fixedDiff.enabled && login) {
      const fixedDiffCharPos = login.indexOf(
        poolServer.fixedDiff.addressSeparator
      );
      if (fixedDiffCharPos != -1) {
        noRetarget = true;
        difficulty = login.substr(fixedDiffCharPos + 1);
        if (difficulty < poolServer.varDiff.minDiff) {
          difficulty = poolServer.varDiff.minDiff;
        }
        login = login.substr(0, fixedDiffCharPos);
        this.logger.append('info', 'pool', 'Miner difficulty fixed to %s', [
          String(difficulty),
        ]);
      }
    }
    return { difficulty, noRetarget };
  }

  async handleMesage(json: any) {
    if (!json.id) {
      this.logger.append(
        'warn',
        this.logName,
        'Miner RPC request missing RPC id',
        []
      );
      return;
    }
    if (!json.method) {
      this.logger.append(
        'warn',
        this.logName,
        'Miner RPC request missing RPC method',
        []
      );
      return;
    }
    await this.handleMinerMethod(json);
  }

  public closeSocket() {
    this.socket.end();
    console.log('socket.end called');
  }

  public reply(json: any, error: any, result: any) {
    if (!this.socket.writable) {
      return;
    }
    let sendData =
      JSON.stringify({
        id: json.id,
        jsonrpc: '2.0',
        error: error ? { code: -1, message: error } : null,
        result: result,
      }) + '\n';
    this.socket.write(sendData);
  }

  sendMessage(method: string, params: object) {
    console.log('writable: ' + this.socket.writable);

    if (!this.socket.writable) {
      console.log('writable');
      return;
    }
    var sendData =
      JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        params: params,
      }) + '\n';
    this.socket.write(sendData);
  }

  public submit(shareAccepted: boolean, miner: Miner, json: any) {
    this.server.checkBan(shareAccepted, miner.getWoker());
    // miner.checkBan(shareAccepted);
    miner.trustCheck({
      shareTrustEnabled: this.shareTrustEnabled,
      shareAccepted,
      shareTrustStepFloat: this.shareTrustStepFloat,
      shareTrustMinFloat: this.shareTrustMinFloat,
      penalty: this.config.poolServer.shareTrust.penalty,
    });

    if (!shareAccepted) {
      this.reply(json, 'Low difficulty share', null);
      return;
    }
    this.sendOK(miner, json);
  }

  public sendOK(miner: Miner, json: any) {
    const now = Date.now() / 1000;
    miner.shareTimeRing.append(now - miner.lastShareTime);
    miner.lastShareTime = now;
    this.reply(json, null, { status: 'OK' });
  }

  public checkSubmit(miner: Miner, params: any, json: any) {
    console.log('inside check job');
    console.log(params);
    let job = miner.isValidJob(params.job_id);
    if (!job) {
      this.reply(json, 'Invalid job id', params.job_id);
      return false;
    }
    params.nonce = params.nonce.substr(0, 8).toLowerCase();
    const noncePattern = new RegExp('^[0-9A-Fa-f]{8}$');

    if (!noncePattern.test(params.nonce)) {
      miner.invalidSubmit(params, this.server, 'Malformed nonce');
      this.reply(json, 'Duplicate share', params.job_id);
      return false;
    }

    if (job.submissions && job.submissions.indexOf(params.nonce) !== -1) {
      miner.invalidSubmit(params, this.server, 'Duplicate share');
      this.reply(json, 'Duplicate share', null);
      return false;
    }
    return job;
  }

  async handleMinerMethod(json: any) {
    const { method, params } = json;

    const miner = MiningServer.connectedMiners[params.id];

    // Check for ban here, so preconnected attackers can't continue to screw you
    const bannedStatus = MiningServer.isBanned(
      String(this.socket.remoteAddress),
      this.config
    );
    if (bannedStatus === 0) {
      this.reply(json, 'your IP is banned', null);
      return;
    } else if (bannedStatus === -1) {
      this.logger.append('info', 'pool', 'Ban dropped for %s', [
        String(this.socket.remoteAddress),
      ]);
    }

    if (method === 'login') {
      this.onLogin(json, params);
      return;
    }

    if (!miner) {
      this.reply(json, 'Unauthenticated', null);
      return;
    }

    switch (method) {
      case 'getjob':
        miner.heartbeat();
        this.reply(json, null, miner.getJob());
        break;
      case 'submit':
        await this.onSubmitJob(miner, params, json);
        break;
      case 'keepalived':
        miner.heartbeat();
        this.reply(json, null, {
          status: 'KEEPALIVED',
        });
        break;
      default:
        this.reply(json, 'invalid method', null);
        const minerText = miner.getUserAddress();
        this.logger.append('warn', 'pool', 'Invalid method: %s (%j) from %s', [
          method,
          params,
          minerText,
        ]);
        break;
    }
  }

  async onData(data: Buffer) {
    this.buffer = Buffer.concat(
      [this.buffer, data],
      this.buffer.length + data.length
    );
    if (Buffer.byteLength(this.buffer, 'utf8') > 10240) {
      // 10KB
      this.buffer = new Buffer('');
      this.logger.append(
        'warn',
        this.logName,
        'Socket flooding detected and prevented from %s',
        [String(this.socket.remoteAddress)]
      );
      this.socket.destroy();
      return;
    }
    if (this.buffer && this.buffer.indexOf('\n') !== -1) {
      const messages = String(this.buffer).split('\n');
      const incomplete =
        String(this.buffer).slice(-1) === '\n' ? '' : messages.pop();
      this.buffer = Buffer.from(String(incomplete));
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.trim() === '') continue;
        let jsonData;
        try {
          jsonData = JSON.parse(message);
        } catch (e) {
          if (message && message.indexOf('GET /') === 0) {
            if (message && message.indexOf('HTTP/1.1') !== -1) {
              this.socket.end('HTTP/1.1' + Handler.httpResponse);
              break;
            } else if (message && message.indexOf('HTTP/1.0') !== -1) {
              this.socket.end('HTTP/1.0' + Handler.httpResponse);
              break;
            }
          }

          this.logger.append(
            'warn',
            this.logName,
            'Malformed message from %s: %s',
            [String(this.socket.remoteAddress), message]
          );
          this.socket.destroy();
          break;
        }
        await this.handleMesage(jsonData);
      }
    }
  }
}
