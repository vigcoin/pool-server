import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { spawn } from "child_process";

import { onMessage, Handler, BlockTemplate } from "../src/index";
import { Miner } from "../src/miner";

import * as EventEmitter from "events";
import * as request from "supertest";
import * as net from "net";
import * as bignum from "bignum";

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

let handler: Handler;

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
  miner = new Miner({
    score: 1, diffHex: 'e',
    difficulty: 10, lastBlockHeight: 1,
    pendingDifficulty: 1,
    options: config,
    VarDiff: {
      tMax: 1,
      tMin: 1
    },
    diff1: bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16),
    trust: {
      threshold: config.poolServer.shareTrust.threshold,
      probability: 1,
      penalty: 0
    }
  }, handler, logger);
});

test('Should updateBlockCandiates ', async () => {
  await handler.updateBlockCandiates(redis, null, {}, 'aaa', 100);
});

test('Should updateBlockCandiates ', async () => {
  await handler.updateBlockCandiates(redis, {}, {}, 'aaa', 100);
});

test('Should getJob 1', () => {
  BlockTemplate.currentBlockTemplate = new BlockTemplate({
    height: 1,
    blocktemplate_blob: "aaddddddddddddddddddddda", reserved_offset: 0
  }, logger);
  miner.getJob();
});

test('Should getJob 2', () => {
  miner.attributes.pendingDifficulty = 1;
  miner.getJob();
});
test('Should getJob 3', () => {
  miner.attributes.pendingDifficulty = 1;

  miner.getJob();
});
test('Should getJob 4', () => {
  miner.attributes.pendingDifficulty = 1;
  miner.getJob();
});
test('Should getJob 5', () => {
  miner.attributes.pendingDifficulty = 1;
  miner.getJob();
});
test('Should getJob 6', () => {
  miner.getJob();
});

test('Should getJob 7', () => {
  BlockTemplate.currentBlockTemplate = null;
  miner.getJob();
});


test('Should retarget', () => {
  miner.attributes.difficulty = 100;
  miner.retarget(Date.now());
});

test('Should retarget', () => {
  miner.attributes.difficulty = 110;
  miner.retarget(Date.now());
});

test('Should retarget', () => {
  miner.attributes.difficulty = 2000001;
  miner.retarget(Date.now());
});

test('Should create Miner', () => {
  config.poolServer.varDiff.maxDiff = 1000;
  miner = new Miner({
    score: 1, diffHex: 'e',
    difficulty: 10, lastBlockHeight: 1,
    pendingDifficulty: 1,
    options: config,
    VarDiff: {
      tMax: 1,
      tMin: 1
    },
    diff1: bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16),
    trust: {
      threshold: config.poolServer.shareTrust.threshold,
      probability: 1,
      penalty: 0
    }
  }, handler, logger);
});

test('Should retarget', () => {
  miner.attributes.difficulty = 2000001;
  miner.retarget(Date.now());
});

test('Should retarget', () => {
  miner.attributes.difficulty = 2000001;
  miner.retarget(Date.now() - 1000);
});

test('Should retarget', () => {
  miner.attributes.difficulty = 2000001;
  miner.retarget(Date.now() - 500);
});

test('Should redirect', () => {
  let isRedirected = miner.isRedirected(5, { minDiff: 90, maxDiff: 110, targetTime: 1 }, {
    difficulty: 100,
    VarDiff: {
      tMax: 19,
      tMin: 10
    }
  });
  expect(isRedirected).toBeTruthy();
  const { direction, newDiff } = isRedirected;

  expect(direction).toBe(1);
  expect(newDiff).toBeTruthy();
});

test('Should redirect', () => {
  let isRedirected = miner.isRedirected(5, { minDiff: 90, maxDiff: 110, targetTime: 1 }, {
    difficulty: 40,
    VarDiff: {
      tMax: 21,
      tMin: 10
    }
  });
  expect(isRedirected).toBeTruthy();
  const { direction, newDiff } = isRedirected;

  expect(direction).toBe(1);
  expect(newDiff).toBeTruthy();
});


test('Should timedout', () => {
  miner.timedout();
});

test('Should timedout', () => {
  miner.setNewDiff(111, { difficulty: 111, login: 'aaa' });
});

test('Should push message', () => {
  miner.pushMessage('aa', {});
});

test('Should checktrust', () => {
  miner.trustCheck({ shareTrustEnabled: true, shareAccepted: true, shareTrustStepFloat: 0.1, shareTrustMinFloat: 0.1, penalty: 0.1 });
});

test('Should checktrust', () => {
  miner.trustCheck({ shareTrustEnabled: true, shareAccepted: true, shareTrustStepFloat: 2.1, shareTrustMinFloat: 1.1, penalty: 0.1 });
});

test('Should checktrust', () => {
  miner.trustCheck({ shareTrustEnabled: true, shareAccepted: false, shareTrustStepFloat: 2.1, shareTrustMinFloat: 1.1, penalty: 0.1 });
});

test('Should checktrust', () => {
  miner.trustCheck({ shareTrustEnabled: false, shareAccepted: true, shareTrustStepFloat: 3.1, shareTrustMinFloat: 1.1, penalty: 0.1 });
});

test('Should get worker', () => {
  miner.getWoker();
});

test('Should invalid submit', () => {
  process.send = null;
  try {
    miner.invalidSubmit({}, server, 'helo');
  } catch (e) {
    console.log(e);
  }
});


test('Should  handler submit', () => {

  handler.checkSubmit(miner, {}, {}, {});
});

test('Should  handler submit', () => {
  let job = miner.getJob();
  miner.validJobs.push(job);
  handler.checkSubmit(miner, { nonce: 'aoasososos' }, {}, job);
});

test('Should  handler submit', () => {
  let job = miner.getJob();
  miner.validJobs.push(job);
  console.log(job);
  handler.checkSubmit(miner, { nonce: 'ACEBAA01' }, {}, { submissions: ['111'] });
});

test('Should  handler submit', () => {
  let job = miner.getJob();
  miner.validJobs.push(job);
  console.log(job);
  handler.checkSubmit(miner, { nonce: 'ACEBAA01' }, {}, { submissions: ['acebaa01'] });
});

test('Should  send ok', () => {
  handler.sendOK(miner, {});
});

test('Should submit', () => {
  handler.submit(false, miner, {});
});

test('Should submit', () => {
  handler.submit(true, miner, {});
});

test('Should handleMessage', (done) => {
  handler.handleMesage({ id: '11' }).then(() => {
    done();
  });
});

test('Should handleMessage', () => {
  handler.closeSocket();
  handler.reply({}, {}, null);
  handler.sendMessage('aaa', {});
});

test('Should change diff', () => {
  handler.changeDiff('100', config.poolServer, 101);
});


test('Should change diff', () => {
  handler.changeDiff('100.aaa', config.poolServer, 99);
});

test('Should change diff', () => {
  handler.changeDiff('100.2', config.poolServer, 101);
});

test('Should update ', async () => {
  handler.changeDiff('100.2', config.poolServer, 101);
});


test('Should updateBlockCandiates ', () => {
  // config.poolServer.poolAddress = "BKBEpnt8FzaUxKZxydESczXRqWGAhGmXKCkYL6XoTMiTDm4h3bjCy72fgbnWpUfGGSEhUTeWoZc8v8S4s18nkmbKMypELLg";
  handler.onLogin({}, { login: 'BKBEpnt8FzaUxKZxydESczXRqWGAhGmXKCkYL6XoTMiTDm4h3bjCy72fgbnWpUfGGSEhUTeWoZc8v8S4s18nkmbKMypELLg' });
});

test('Should close all', () => {
  // client.close();
  BlockTemplate.currentBlockTemplate = null;

  tcpServer.close();

  redis.quit();
});

