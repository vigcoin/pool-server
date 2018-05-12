import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { spawn } from "child_process";

import { onMessage, BlockTemplate } from "../src/index";
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
import * as fs from 'fs';
import { promisify } from 'util';
import { Router, Request, Response, Application } from 'express';
import * as express from 'express';
import * as bodyParser from 'body-parser';

const app: Application = express();

app.use(bodyParser());
app.all('/', (req, res) => {
  console.log('inside body parser');
  console.log(req.body);
  const json = {
    "id": "test",
    "jsonrpc": "2.0",
    "result": {
      "blocktemplate_blob": "0100abcdeabcd31231244",
      "difficulty": 1,
      "height": 1,
      "reserved_offset": 0,
      "status": "OK"
    }
  };
  res.json(json);
});


let daemon;


test('Should start daemon', (done) => {
  BlockTemplate.jobRefresh(true, pr, logger, config);
  daemon = app.listen(config.daemon.port, () => {
    console.log('daemon running');
    done();
  });
});



test('Should start refresh', (done) => {
  setTimeout(() => {
    expect(BlockTemplate.currentBlockTemplate).toBeTruthy();
    done();

  }, 1000)
});


test('Should close all', () => {
  daemon.close();
  redis.quit();
});
