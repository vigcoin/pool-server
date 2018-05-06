import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
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
const {config}= reader.get();


console.log(config);
const redis = new RedisClient({});
const logger = new Logger(config.logger);
const pr = new PoolRequest(config.daemon, config.wallet, config.api);


test('Should greet with message', () => {
  const server = new MiningServer(config, logger, pr, redis);
  expect(server).toBeTruthy();
});

test('Should close all', () => {
  redis.quit();
});

