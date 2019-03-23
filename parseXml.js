const redis = require('redis');
const bluebird = require('bluebird');
const path = require('path');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = () => redis.createClient(6380, 'localhost');
const parseString = require('xml2js').parseString
const auth = require('./auth.js');
const httpntlm = require('httpntlm');


//const url = `http://sprocketus.sandisk.com/sites/engdyncrm/zsd_tcrrequest/BiCS4%20512Gb%20X3%202P%20%2016D8CE%20%20768C%20-%20T5773%20(768DUTs%20-%20Default)%20%20%2008_80%20_463391B99839E91180E9005056AB4520/T5773_BiCs4_8192Gb_X3_BGA110_S4E_16D8CE_tam4269af0880_768c.xml`;
//const url = `http://sprocketus.sandisk.com/sites/engdyncrm/zsd_tcrrequest/BiCS4%20256Gb%20X3%202P%20%2016D4CE%20%20768D%20-%20T5773%20(768DUTS%20-%20default)%20%20%2016_80%20_9BCB0B6A2C39E91180E9005056AB4520/T5773_BiCs4_4096Gb_X3_BGA304_HermesII_16D4CE_tps4156af1680_768d.xml`;
const url = `http://sprocketus.sandisk.com/sites/engdyncrm/zsd_tcrrequest/BiCS3%20256Gb%20X3%202P%20NK%208D4CE%20%20192B%20-%20T5831%20(192DUTs%20-%20Special%20Category-%20TM,%20SH%20flow,%20or%20others)%20%20%2001_00%20_EB86BA91ED34E91180E900505/T5831_BiCs3_2048Gb_X3_BGA132_ENT_NK_8D4CE_ten3644af0100_192b.xml`;


exports.queryNewTb = queryNewTb;

async function queryNewTb(url) {
	return new Promise((resolve, reject) => {
		const options = Object.assign({ url }, auth.options);
		httpntlm.get(options, (err, res) => {
			if(err) return console.error(err);
			if(res && res.body) {
				parseString(res.body, (err, result) => {
					if(err) return console.error(err);
					const tech = result['TestRecipe']['$']['tech'];
					const arr = pickTbName(result['TestRecipe']['TestBlock']);
					const tp = result['TestRecipe']['$']['dynamics'];

					//const refKey = isMT2(tp) ? `${techPath(tech)}_MT2` : techPath(tech);
					const refKey = techPath(tech, tp);

					const key = path.basename(url);
					const interKey = `known:${key}`;
					const client = redisClient();
					client.multi()
						.sadd(key, arr)
						.sadd(interKey, arr)
						.sinterstore(interKey, interKey, refKey)
						.sdiffstore(key, key, interKey)
						.del(interKey)
						.smembers(key)
						.del(key)	
						.execAsync().then(data => {
							//console.log(refKey);//, data);
							resolve(data[5]);
						});
					client.quit();

					//let arr2 = pickIgnoreBit(result['TestRecipe']['TestBlock']);
					//let tb_w_zero_ign = arr.filter((e, i) => e.includes('_RD_') && arr2[i] === '0');
					//console.log(tb_w_zero_ign);
				});
			}
		});
	});
}

function isMT2(tp = '') {
	const _tp = tp.toLowerCase();
	return _tp.endsWith('_192b') || _tp.endsWith('_96b') || _tp.endsWith('_384d') || _tp.endsWith('_384b'); 
}

function techPath(tech = '', tp = '') {
	const _tech = tech.toLowerCase();
	const _tp = tp.toLowerCase();

	if(_tech.startsWith('bics4_x3')) return 'BiCS4_CommonCode' + (isMT2(_tp) ? '_MT2' : '');
	if(_tech.startsWith('bics4_x4')) return 'BiCS4_X4_CommonCode' + (isMT2(_tp) ? '_MT2' : '');;
	if(_tech.startsWith('bics3_x3')) return isMT2(_tp) ? '' : 'BiCS3_CommonCode';

	console.error(`unknown ${tech}`);
	return '';
}

function pickTbName(arr = []) {
	return arr.map(ele => ele['$']['name']);
};

function pickIgnoreBit(arr = []) {
	return arr.map(ele => ele['IgnoreBit'][0]);
};


if(require.main === module) {
	(async () => {
		console.log(path.basename(url));
		console.log(await queryNewTb(url));
		//await queryNewTb(url);
	})();
}

