'use strict';
// libraries
const fetch = require('node-fetch');
const {ExplorerApi} = require('atomicassets');
const fs = require('fs');
const request = require('request');

// modules
const assetUtil = require('./asset-util.js');
const dateUtil = require('./date-util.js');

// constants

// variables
/* eslint-disable no-unused-vars */
let config;
let loggingUtil;
let waxApi;
const templates = [];
let ready = false;
/* eslint-enable no-unused-vars */

// functions
const init = (_config, _loggingUtil) => {
  /* istanbul ignore if */
  if (_config === undefined) {
    throw new Error('config is required.');
  }
  /* istanbul ignore if */
  if (_loggingUtil === undefined) {
    throw new Error('loggingUtil is required.');
  };
  config = _config;
  loggingUtil = _loggingUtil;

  ready = false;
  setTimeout(setWaxApiAndAddTemplates, 0);
};

const deactivate = () => {
  /* eslint-disable no-unused-vars */
  config = undefined;
  loggingUtil = undefined;
  /* eslint-enable no-unused-vars */
  waxApi = undefined;
  templates.length = 0;
  ready = false;
};


const setWaxApiAndAddTemplates = async () => {
  try {
    waxApi = new ExplorerApi('https://wax.api.atomicassets.io', 'atomicassets', {fetch});
  } catch (error) {
    console.log('INTERIM setWaxApiAndAddTemplates', error.message);
    setTimeout(setWaxApiAndAddTemplates, 1000);
    return;
  }
  setTimeout(addAllTemplates, 0);
};


const addAllTemplates = async () => {
  loggingUtil.log(dateUtil.getDate(), 'STARTED addAllTemplates');
  let page = 1;
  const max = 100;

  const addTemplates = async () => {
    loggingUtil.log(dateUtil.getDate(), 'STARTED addTemplates page', page);
    let lessThanMax = false;
    const worked = false;
    try {
      const pageTemplates = await waxApi.getTemplates({'collection_name': 'crptomonkeys'}, page, max);
      lessThanMax = templates.length < max;

      for (let pageTemplateIx = 0; pageTemplateIx < pageTemplates.length; pageTemplateIx++) {
        const pageTemplate = pageTemplates[pageTemplateIx];
        const pageTemplateData = {};
        pageTemplateData.template_id = pageTemplate.template_id;
        pageTemplateData.name = pageTemplate.immutable_data.name;
        pageTemplateData.img = pageTemplate.immutable_data.img;
        pageTemplateData.backimg = pageTemplate.immutable_data.backimg;
        templates.push(pageTemplateData);
      }

      if (lessThanMax) {
        loggingUtil.log(dateUtil.getDate(), 'SUCCESS addAllTemplates');
        setTimeout(cacheAllCardImages, 0);
      } else {
        loggingUtil.log(dateUtil.getDate(), 'SUCCESS addTemplates page' + page);
        page++;
        setTimeout(addTemplates, 1000);
      }
    } catch (error) {
      loggingUtil.log(dateUtil.getDate(), 'INTERIM addTemplates page' + page, error.message);
      setTimeout(addTemplates, 1000);
    }
  };
  addTemplates();
};


const cacheAllCardImages = async () => {
  loggingUtil.log(dateUtil.getDate(), 'STARTED cacheAllCardImages');

  const getFile = async (ipfs) => {
    const url = `https://wax.atomichub.io/preview?ipfs=${ipfs}&size=185&output=webp&animated=true`;
    const fileName = `static-html/ipfs/${ipfs}.webp`;
    if (!fs.existsSync(fileName)) {
      return new Promise((resolve, reject) => {
        request(url).pipe(fs.createWriteStream(fileName)).on('close', resolve);
      });
    }
  };

  for (let templateIx = 0; templateIx < templates.length; templateIx++) {
    loggingUtil.log(dateUtil.getDate(), 'INTERIM cacheAllCardImages', (templateIx+1), templates.length);
    const card = templates[templateIx];
    await getFile(card.img);
    await getFile(card.backimg);
  }
  ready = true;
  loggingUtil.log(dateUtil.getDate(), 'SUCCESS cacheAllCardImages');
};

const getTemplateCount = () => {
  return templates.length;
};

const getOwnedCards = async (owner) => {
  const assetOptions = {'collection_name': 'crptomonkeys', 'owner': owner};
  const assets = await waxApi.getAssets(assetOptions);
  return assets;
};

const getPayoutInformation = async (owner) => {
  const resp = {};
  resp.cardCount = 0;
  resp.templateCount = templates.length;
  // loggingUtil.log(dateUtil.getDate(), 'STARTED countCards');
  const ownedCards = await getOwnedCards(owner);
  const frozenAssetByTemplateMap = {};
  const unfrozenAssetByTemplateMap = {};

  resp.frozenAssetByTemplateMap = frozenAssetByTemplateMap;
  resp.unfrozenAssetByTemplateMap = unfrozenAssetByTemplateMap;

  for (let ownedCardIx = 0; ownedCardIx < ownedCards.length; ownedCardIx++) {
    const ownedCard = ownedCards[ownedCardIx];
    const assetId = ownedCard.asset_id;
    assetUtil.thawAssetIfItIsTime(assetId);
    const template_id = ownedCard.template.template_id.toString();
    if (assetUtil.isAssetFrozen(assetId)) {
      if (frozenAssetByTemplateMap[template_id] === undefined) {
        frozenAssetByTemplateMap[template_id] = [];
      }
      frozenAssetByTemplateMap[template_id].push(assetId);
    } else {
      if (unfrozenAssetByTemplateMap[template_id] === undefined) {
        unfrozenAssetByTemplateMap[template_id] = [];
      }
      unfrozenAssetByTemplateMap[template_id].push(assetId);
    }
  }
  // loggingUtil.log(dateUtil.getDate(), 'ownedCards', ownedCards);
  // loggingUtil.log(dateUtil.getDate(), 'ownedCardTemplateSet', ownedCardTemplateSet);
  for (let templateIx = 0; templateIx < templates.length; templateIx++) {
    const card = templates[templateIx];
    const hasCard = unfrozenAssetByTemplateMap[card.template_id] !== undefined;
    // loggingUtil.log(dateUtil.getDate(), 'template_id', card.template_id, 'hasCard', hasCard);
    if (hasCard) {
      resp.cardCount++;
    }
    // if (await atomicassetsUtil.ownerHasCard(owner, card.template_id)) {
    // resp.cardCount++;
    // }
  }
  // loggingUtil.log(dateUtil.getDate(), 'SUCCESS countCards');

  const winningOneCardOdds = resp.cardCount/resp.templateCount;
  const winningOdds = winningOneCardOdds * winningOneCardOdds * winningOneCardOdds;
  const payoutAmountDenominator = winningOneCardOdds * winningOneCardOdds;

  if (winningOdds == 0) {
    resp.winningOdds = 0;
    resp.payoutAmount = 0;
  } else {
    resp.winningOdds = winningOdds;
    resp.payoutAmount = parseInt((1./payoutAmountDenominator).toFixed(0), 10);
  }

  // loggingUtil.log(dateUtil.getDate(), 'SUCCESS getPayoutInformation', resp);

  return resp;
};

const isReady = () => {
  return ready;
};

const getTemplates = () => {
  return templates;
};

module.exports.init = init;
module.exports.deactivate = deactivate;
module.exports.getTemplateCount = getTemplateCount;
module.exports.getOwnedCards = getOwnedCards;
module.exports.getPayoutInformation = getPayoutInformation;
module.exports.isReady = isReady;
module.exports.getTemplates = getTemplates;
