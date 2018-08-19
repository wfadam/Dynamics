const redis = require('redis');
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = port => redis.createClient(port, 'localhost');
const R = require('ramda');
const dayOfst = -90;


const migrateSCR = async () => {
	const fromClient = redisClient(6379);
	const toClient = redisClient(6380);

	const fromSets = new Set(await fromClient.keysAsync('SCR-*'));
	const toSets = new Set(await toClient.keysAsync('SCR-*'));
	const diff = new Set([...fromSets].filter(msg => ! toSets.has(msg)));
	console.log(diff.size);
	await Promise.all(
		[...diff].map(async key => {
			if(key.includes(':')) return;
			const value = await fromClient.hgetallAsync(key);
			console.log(value);
			if(value && Object.keys(value).length > 0) {
				return toClient.hmsetAsync(key, value);
			}
		}));

	fromClient.quit();
	toClient.quit();
};


//migrateSCR();
