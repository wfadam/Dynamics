const redis = require('redis');
const bluebird = require('bluebird');
const path = require('path');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = () => redis.createClient(6380, 'localhost');
const svn = require('svn-interface');
const options = { [Buffer.from([ 117, 115, 101, 114, 110, 97, 109, 101 ]).toString()]: Buffer.from([102 ,101 ,110 ,103 ,119]).toString(), [Buffer.from([ 112, 97, 115, 115, 119, 111, 114, 100 ]).toString()]: Buffer.from([97 ,56 ,119 ,52 ,100 ,98 ,47 ,47 ,83 ,97 ,110 ,100 ,105 ,115 ,107]).toString() };
const svnPath = (tech = '') => `https://svnsdus.sandisk.com/svn/pete_memory/MTPrograms/${tech}/tcommon/javaapi/TestItemLibrary.java`;

updateTbListAll();
setInterval(() => updateTbListAll(), 5 * 60 * 1000);

async function updateTbList(tech = '') {
	return new Promise((resolve, reject) => {
		svn.cat(svnPath(tech), options,
			(err, data) => {
				if(err) return console.log(err);
				const arr = parseTB(data);
				const client = redisClient();
				const key = tech;
				client.multi().del(key).sadd(key, arr).execAsync(); client.quit();
				resolve({tech, length: arr.length});
			});
	});
}

async function updateTbListAll() {
	const arr = Promise.all([
		updateTbList('BiCS3_CommonCode'),
		updateTbList('BiCS4_CommonCode'),
		updateTbList('BiCS4_CommonCode_MT2'),
		updateTbList('BiCS4_X4_CommonCode'),
		updateTbList('BiCS4_X4_CommonCode_MT2')]);
	console.log(await arr);
}

function parseTB(data = '') {
	let found;
	let idx = 0;;
	const regex = /\(\s*"([_\w]+)"/;
	let arr = []
	while(true) {
		found = data.slice(idx).match(regex);
		if(found) {
			arr.push(found[1]);
			idx += found['index'] + found[1].length;
			continue;
		}

		break;
	}
	return arr;
}

