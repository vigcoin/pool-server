import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
import { Handler } from './socket-handler';
import { RedisClient } from 'redis';
import * as net from "net";
import { promisify } from "util";

// import { Socket } from "net";

export class MiningServer {
  config: any;

  servers: any = {};
  logger: Logger;

  constructor(config: any, logger: Logger, poolRequest: PoolRequest, redis: RedisClient) {
    this.config = config;
    this.logger = logger;
    for (const { port, difficulty } of this.config.poolServer.ports) {

      const server = net.createServer(async (socket) => {
        new Handler(this.config, port, difficulty, socket, logger, poolRequest, redis);
      });
      this.servers[port] = server;
    }
  }

  async start() {
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
}