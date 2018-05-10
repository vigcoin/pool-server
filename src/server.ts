import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
import { Handler } from './socket-handler';
import { Miner } from './miner';
import { RedisClient } from 'redis';

import { BlockTemplate } from "./block-template";
import * as net from "net";
import { promisify } from "util";

// import { Socket } from "net";

export class MiningServer {
  config: any;

  servers: any = {};
  logger: Logger;

  req: PoolRequest;
  logName: 'pool';
  retargetTimer: NodeJS.Timer;
  checkMinerTimer: NodeJS.Timer;
  timeoutInterval: number = 30000;   // in case configuration file is not configurated.

  public static perIPStats: any = {};
  public static banned: any = {};
  public static connectedMiners: any = {};
  public static handlers: any = [];

  constructor(config: any, logger: Logger, poolRequest: PoolRequest, redis: RedisClient) {
    this.config = config;
    this.logger = logger;
    this.req = poolRequest;
    for (const { port, difficulty } of this.config.poolServer.ports) {

      const server = net.createServer(async (socket) => {
        MiningServer.handlers.push(
          new Handler(this.config, port, difficulty, socket, logger, poolRequest, redis)
        );
      });
      this.servers[port] = server;
    }
  }

  start() {
    this.startRetargetMiners();
    this.startCheckTimeout();
  }

  stop() {
    clearInterval(this.retargetTimer);
    clearInterval(this.checkMinerTimer);
  }

  checkBan(validShare: boolean, worker: any) {

    const { banning } = this.config.poolServer;
    const { ip, id, address } = worker;
    if (!banning.enabled) return;

    // Init global per-IP shares stats
    if (!MiningServer.perIPStats[ip]) {
      MiningServer.perIPStats[ip] = { validShares: 0, invalidShares: 0 };
    }

    const stats = MiningServer.perIPStats[ip];
    validShare ? stats.validShares++ : stats.invalidShares++;
    if (stats.validShares + stats.invalidShares >= banning.checkThreshold) {
      if (stats.invalidShares / stats.validShares >= banning.invalidPercent / 100) {
        // this.logger.append('warn', 'pool', 'Banned %s@%s', [address, ip]);
        MiningServer.banned[ip] = Date.now();
        delete MiningServer.connectedMiners[id];
        if (process.send) {
          process.send({ type: 'banIP', ip });
        }
      }
      else {
        stats.invalidShares = 0;
        stats.validShares = 0;
      }
    }
  }
  static isBanned(ip: string, config: any) {
    if (!MiningServer.banned[ip]) return 1;
    const bannedTime = MiningServer.banned[ip];
    const bannedTimeAgo = Date.now() - bannedTime;
    const timeLeft = config.poolServer.banning.time * 1000 - bannedTimeAgo;
    if (timeLeft > 0) {
      return 0;
    }
    else {
      delete MiningServer.banned[ip];
      return -1;
    }
  }

  startRetargetMiners() {
    this.retargetTimer = setInterval(() => {
      this.retargetMiners();
    }, this.config.poolServer.varDiff.retargetTime * 1000);
  }

  retargetMiners() {
    const now = Date.now() / 1000 | 0;
    for (const minerId of Object.keys(MiningServer.connectedMiners)) {
      const miner = MiningServer.connectedMiners[minerId];
      if (!miner.noRetarget) {
        miner.retarget(now);
      }
    }
  }

  startCheckTimeout() {
    const { timeoutInterval } = this.config.poolServer;
    this.checkMinerTimer = setInterval(() => {
      this.checkTimeOutMiners();
    }, timeoutInterval || this.timeoutInterval);

  }

  removeBanned(now: any, banning: any) {
    const banningEnabled = banning && banning.enabled;
    if (banningEnabled) {
      for (const ip of Object.keys(MiningServer.banned)) {
        const banTime = MiningServer.banned[ip];
        if (now - banTime > banning.time * 1000) {
          delete MiningServer.banned[ip];
          delete MiningServer.perIPStats[ip];
          this.logger.append('info', 'pool', 'Ban dropped for %s', [ip]);
        }
      }
    }
  }
  public removeTimeout(now: any, banning: any, minerTimeout: any) {
    const timeout = minerTimeout * 1000;
    for (const minerId of Object.keys(MiningServer.connectedMiners)) {
      const miner = MiningServer.connectedMiners[minerId];
      if (now - miner.lastBeat > timeout) {
        miner.timeout();
        delete MiningServer.connectedMiners[minerId];
      }
    }
  }

  checkTimeOutMiners() {
    /* Every 30 seconds clear out timed-out miners and old bans */
    const now = Date.now();
    let { banning, minerTimeout } = this.config.poolServer;
    this.removeTimeout(now, banning, minerTimeout);
    this.removeBanned(now, banning);
  }

  async listen() {
    for (const port of Object.keys(this.servers)) {
      let server = this.servers[port];
      const listen = promisify(server.listen).bind(server);
      // try {
      await listen(port);
      this.logger.append('info', 'pool', 'Started server listening on port %d', [port]);
      // } catch (e) {
      //   this.logger.append('info', 'pool', 'Could not start server listening on port %d, error: $j', [port, e]);
      // }
    }
  }

  closeAll() {
    for (const port of Object.keys(this.servers)) {
      const server = this.servers[port];
      server.close();
    }
  }
}