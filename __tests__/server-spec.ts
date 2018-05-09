import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { spawn } from "child_process";

import { onMessage } from "../src/index";
import { Miner } from "../src/miner";

import * as EventEmitter from "events";
import * as request from "supertest";
import * as net from "net";

// import * as fs from 'fs';
import * as path from 'path';
// import { promisify } from 'util';
// import { Router, Request, Response, Application } from 'express';
// import * as express from 'express';
// import * as bodyParser from 'body-parser';

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


test('Should create', () => {
  expect(server).toBeTruthy();
});

test('Should  start', (done) => {
  server.start();
  setTimeout(() => {
    server.stop();
    done();
  }, 1500);
});

test('Should  start', (done) => {
  config.poolServer.timeoutInterval = 100;
  server.start();
  setTimeout(() => {
    server.stop();
    done();
  }, 1500);
});

test('Should  listen', async () => {
  try {
    await server.listen();

  } catch (e) {
    console.log(e);
  }
  server.closeAll();
});

test('Should  check timedout miners', (done) => {
  server.checkTimeOutMiners();
  setTimeout(() => {
    done();
  }, 1000);
});

test('Should  check timedout miners', (done) => {
  MiningServer.connectedMiners['aaa'] = {
    lastBeat: Date.now(),
    timeout: () => {
    }
  };
  setTimeout(() => {
    server.removeTimeout(Date.now(), banning, minerTimeout);
    done();
  }, 1000);
});

test('Should  check timedout miners', () => {
  MiningServer.connectedMiners['aaa'] = {
    lastBeat: Date.now(),
    timeout: () => {
    }
  };
  server.removeTimeout(Date.now(), banning, minerTimeout);
});


test('Should  retarget miners', (done) => {
  MiningServer.connectedMiners['aaa'] = {
    noRetarget: true,
    retarget: () => {
    }
  };

  MiningServer.connectedMiners['bbb'] = {
    noRetarget: false,
    retarget: () => {
    }
  };
  server.retargetMiners();
  setTimeout(() => {
    done();
  }, 1000);
});

test('Should  check timedout miners', (done) => {
  MiningServer.banned['aaa'] = Date.now();
  setTimeout(() => {
    server.removeBanned(Date.now(), banning);
    done();
  }, 1000);
});

test('Should  check timedout miners', () => {
  MiningServer.banned['aaa'] = Date.now();
  server.removeBanned(Date.now(), banning);
});

test('Should  check timedout miners', () => {
  server.removeBanned(Date.now(), null);
});

test('Should  check is banned', (done) => {
  console.log("banned");
  MiningServer.banned['aaa'] = Date.now();
  MiningServer.banned['bbb'] = Date.now();

  expect(MiningServer.isBanned('ccc', config)).toBe(1);
  expect(MiningServer.isBanned('aaa', config)).toBe(0);
  setTimeout(() => {
    expect(MiningServer.isBanned('bbb', config)).toBe(-1);
    done();
  }, 500)
});

test('Should  check banned', () => {
  process.send = function () { };
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = false;
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = true;

});

test('Should  check banned', () => {
  process.send = null;
  MiningServer.perIPStats = {};
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = false;
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
});


test('Should  listen', async () => {
  try {
    await server.listen();

  } catch (e) {
    console.log(e);
  }
});

test('Should  response to request', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      client.write("hello");
      setTimeout(() => {
        server.closeAll();
        done();
      }, 500)
    });
    break;
  }
});

test('Should close all', () => {
  redis.quit();
});

