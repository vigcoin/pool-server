import * as crypto from "crypto";
import {convert_blob as convertBlob} from '@vigcoin/cryptonote-util';
import { PoolRequest } from '@vigcoin/pool-request';
import { Logger } from '@vigcoin/logger';

import { MiningServer } from "./server";

var instanceId = crypto.randomBytes(4);

export class BlockTemplate {
  blob: any;
  difficulty: number;
  height: number;
  reserveOffset: number;
  buffer: Buffer;
  extraNonce: number;

  public static currentBlockTemplate: BlockTemplate;
  public static validBlockTemplates: BlockTemplate[] = [];

  constructor(template: any) {
    this.blob = template.blocktemplate_blob;
    this.difficulty = template.difficulty;
    this.height = template.height;
    this.reserveOffset = template.reserved_offset;
    this.buffer = new Buffer(this.blob, 'hex');
    instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
    this.extraNonce = 0;
  }

  nextBlob() {
    this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
    return convertBlob(this.buffer).toString('hex');
  }

  static async get(req: PoolRequest, config: any) {

    return req.daemon('/', 'getblocktemplate', { reserve_size: 8, wallet_address: config.poolServer.poolAddress });
  }

  static async jobRefresh(loop: boolean = false, req: PoolRequest, logger: Logger, config: any) {
    try {
      const {result:template} = await BlockTemplate.get(req, config);
      console.log('template');
      console.log(template);
      if (!BlockTemplate.currentBlockTemplate || template.height > BlockTemplate.currentBlockTemplate.height) {
        logger.append('info', 'pool', 'New block to mine at height %d w/ difficulty of %d', [template.height, template.difficulty]);
        BlockTemplate.process(template);
      }
    } catch (e) {
      logger.append('error', 'pool', 'Error refreshing: %j', [e]);
      return;
    }

    if (loop)
      setTimeout(() => {
        this.jobRefresh(true, req, logger, config);
      }, config.poolServer.blockRefreshInterval);
  }

  static process(template: any) {
    if (BlockTemplate.currentBlockTemplate)
      BlockTemplate.validBlockTemplates.push(BlockTemplate.currentBlockTemplate);

    if (BlockTemplate.validBlockTemplates.length > 3)
      BlockTemplate.validBlockTemplates.shift();

    BlockTemplate.currentBlockTemplate = new BlockTemplate(template);
    BlockTemplate.notifyMiners();
  }

  static notifyMiners() {
    for (const minerId of Object.keys(MiningServer.connectedMiners)) {
      const miner = MiningServer.connectedMiners[minerId];
      miner.pushMessage('job', miner.getJob());
    }
  }

  static getJobTemplate(job: any) {
    return BlockTemplate.currentBlockTemplate.height === job.height ? BlockTemplate.currentBlockTemplate :
      BlockTemplate.validBlockTemplates.filter(function (t: any) {
        return t.height === job.height;
      })[0];
  }
}
