import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { spawn } from "child_process";

import { onMessage, Handler } from "../src/index";
import { Miner } from "../src/miner";

import * as EventEmitter from "events";
import * as request from "supertest";
import * as net from "net";

// import * as fs from 'fs';
import * as path from 'path';
// import { promisify } from 'util';
import { Router, Request, Response, Application } from 'express';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as net from "net";

// const app: Application = express();
// const app1: Application = express();

const file = path.resolve(__dirname, './config.json');
const reader = new ConfigReader(file);
const { config } = reader.get();

const redis = new RedisClient({});
const logger = new Logger(config.logger);
const pr = new PoolRequest(config.daemon, config.wallet, config.api);
const server = new MiningServer(config, logger, pr, redis);



let { banning, minerTimeout } = config.poolServer;

let miner: Miner;

let port = 12306;

let handler;

let tcpServer = net.createServer((socket) => {
  handler = new Handler(server, config, port, 100, socket, logger, pr, redis);
});
tcpServer.listen(port);

let client;

test('should start a request', (done) => {
  client = net.connect(String(port), function () {
    expect(handler).toBeTruthy();
    done();
  });
});


test('Should create Miner', () => {
  miner = new Miner({ score: 1, diffHex: 'e', 
  difficulty: 1, lastBlockHeight: 1,
   pendingDifficulty: 1 }, handler, logger);
});

test('Should getJob', () => {
   miner.getJob();
});

test('Should close all', () => {
  // client.close();
  tcpServer.close();

  redis.quit();
});

