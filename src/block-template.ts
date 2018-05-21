import * as crypto from 'crypto';
import {
  convert_blob as convertBlob,
  construct_block_blob as cbb,
} from '@vigcoin/cryptonote-util';
import { PoolRequest } from '@vigcoin/pool-request';
import { Logger } from '@vigcoin/logger';

import { MiningServer } from './server';

var instanceId = crypto.randomBytes(4);

export class BlockTemplate {
  blob: any;
  difficulty: number;
  height: number;
  reserveOffset: number;
  buffer: Buffer;
  extraNonce: number;
  logger: Logger;

  public static currentBlockTemplate: BlockTemplate;
  public static validBlockTemplates: BlockTemplate[] = [];

  constructor(template: any, logger: Logger) {
    this.blob = template.blocktemplate_blob;
    this.difficulty = template.difficulty;
    this.height = template.height;
    this.reserveOffset = template.reserved_offset;
    this.buffer = new Buffer(this.blob, 'hex');
    instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
    this.extraNonce = 0;
    this.logger = logger;
  }

  nextBlob() {
    this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
    try {
      return convertBlob(this.buffer).toString('hex');
    } catch (e) {
      this.logger.append('info', 'pool', 'Error convert Blob', [e]);
    }
  }

  static async get(req: PoolRequest, config: any) {
    return req.daemon('/json_rpc', 'getblocktemplate', {
      reserve_size: 8,
      wallet_address: config.poolServer.poolAddress,
    });
  }

  static async jobRefresh(
    loop: boolean,
    req: PoolRequest,
    logger: Logger,
    config: any
  ) {
    try {
      const { result: template, error } = await BlockTemplate.get(req, config);
      if (error) {
        logger.append('error', 'pool', 'Error refreshing: %s', [error.message]);
        return;
      }
      if (!BlockTemplate.currentBlockTemplate) {
        logger.append(
          'info',
          'pool',
          'New block to mine at height %d w/ difficulty of %d',
          [template.height, template.difficulty]
        );
        BlockTemplate.process(template, logger);
      } else if (template.height > BlockTemplate.currentBlockTemplate.height) {
        logger.append(
          'info',
          'pool',
          'New block to mine at height %d w/ difficulty of %d',
          [template.height, template.difficulty]
        );
        BlockTemplate.process(template, logger);
      }
    } catch (e) {
      logger.append('error', 'pool', 'Error refreshing: %s', [e]);
      return;
    }

    if (loop)
      setTimeout(() => {
        this.jobRefresh(true, req, logger, config);
      }, config.poolServer.blockRefreshInterval);
  }

  static process(template: any, logger: Logger) {
    if (BlockTemplate.currentBlockTemplate)
      BlockTemplate.validBlockTemplates.push(
        BlockTemplate.currentBlockTemplate
      );

    if (BlockTemplate.validBlockTemplates.length > 3)
      BlockTemplate.validBlockTemplates.shift();

    BlockTemplate.currentBlockTemplate = new BlockTemplate(template, logger);
    BlockTemplate.notifyMiners();
  }

  static notifyMiners() {
    for (const minerId of Object.keys(MiningServer.connectedMiners)) {
      const miner = MiningServer.connectedMiners[minerId];
      miner.pushMessage('job', miner.getJob());
    }
  }

  static getJobTemplate(job: any) {
    if (
      BlockTemplate.currentBlockTemplate &&
      BlockTemplate.currentBlockTemplate.height === job.height
    ) {
      return BlockTemplate.currentBlockTemplate;
    }
    return BlockTemplate.validBlockTemplates.filter(function(t: any) {
      return t.height === job.height;
    })[0];
  }

  shareBuffer(job: any, params: any, logger: Logger) {
    const template = new Buffer(this.buffer.length);
    this.buffer.copy(template);
    template.writeUInt32BE(job.extraNonce, this.reserveOffset);
    try {
      return cbb(template, new Buffer(params.nonce, 'hex'));
    } catch (e) {
      logger.append('error', 'pool', 'get share buffer error', [e]);
    }
  }
}
