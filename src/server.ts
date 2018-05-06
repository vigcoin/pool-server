import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
import { Handler } from './socket-handler';
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
  timeoutInterval: number = 30000;

  public static perIPStats: any = {};
  public static banned: any = {};
  public static connectedMiners: any = {};

  constructor(config: any, logger: Logger, poolRequest: PoolRequest, redis: RedisClient) {
    this.config = config;
    this.logger = logger;
    this.req = poolRequest;
    for (const { port, difficulty } of this.config.poolServer.ports) {

      const server = net.createServer(async (socket) => {
        new Handler(this.config, port, difficulty, socket, logger, poolRequest, redis);
      });
      this.servers[port] = server;
    }
  }

  start() {
    this.startRetargetMiners();
    this.startCheckTimeout();
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
      // logger.append('info', 'pool', 'Ban dropped for %s', [ip]);
      return -1;
    }
  }

  async getBlockTemplate() {
    return this.req.daemon('/', 'getblocktemplate', { reserve_size: 8, wallet_address: this.config.poolServer.poolAddress });
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

  checkTimeOutMiners() {
    /* Every 30 seconds clear out timed-out miners and old bans */
    const now = Date.now();
    let { banning } = this.config.poolServer;

    const banningEnabled = banning && banning.enabled;
    const timeout = this.config.poolServer.minerTimeout * 1000;
    for (const minerId of Object.keys(MiningServer.connectedMiners)) {
      const miner = MiningServer.connectedMiners[minerId];
      if (now - miner.lastBeat > timeout) {
        this.logger.append('warn', 'pool', 'Miner timed out and disconnected %s@%s', [miner.login, miner.ip]);
        delete MiningServer.connectedMiners[minerId];
      }
    }
    if (banningEnabled) {
      for (const ip in MiningServer.banned) {
        const banTime = MiningServer.banned[ip];
        if (now - banTime > this.config.poolServer.banning.time * 1000) {
          delete MiningServer.banned[ip];
          delete MiningServer.perIPStats[ip];
          this.logger.append('info', 'pool', 'Ban dropped for %s', [ip]);
        }
      }
    }
  }

  async listen() {
    for (const port of Object.keys(this.servers)) {
      let server = this.servers[port];

      const listen = promisify(server.listen).bind(server);
      try {
        await listen(port);
        this.logger.append('info', 'pool', 'Started server listening on port %d', [port]);
      } catch (e) {
        this.logger.append('info', 'pool', 'Could not start server listening on port %d, error: $j', [port, e]);
      }
    }
  }

  closeAll() {
    for (const server of this.servers) {
      server.close();
    }
  }
}