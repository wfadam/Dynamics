const cluster = require('cluster');
const redis = require('redis');
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = () => redis.createClient(6380, 'localhost');
const {workOn} = require('./CRWorker.js');
const {getJobs} = require('./crawl.js');
const numThd = require('os').cpus().length * 2;
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

//async function look4NewJob() {
//	try {
//		const jobs = await Promise.all([getJobs(10061), getJobs(10173)]);
//		const flatJobs = [...jobs[0], ...jobs[1]]; //console.log(flatJobs);
//
//		const client = redisClient();
//		for(let job of flatJobs) {
//			let {crn, otype, oid, age} = job;
//			let cnt = await client.zaddAsync('RECORD:CR', 'CH', age, JSON.stringify({crn, otype, oid}));
//			if(cnt > 0) {
//				let msg = JSON.stringify(job);
//				await client.saddAsync('JOBS:CR', msg);
//				console.log(`Observed ${msg}`);
//			}
//		}
//		client.quit();
//
//	} catch(e) {
//		console.error(e);
//	}
//	setTimeout(look4NewJob, 15 * ONE_SECOND);
//}

async function look4NewJob() {
	try {
		const jobs = await Promise.all([getJobs(10061), getJobs(10173)]);
		const flatJobs = [...jobs[0], ...jobs[1]]; //console.log(flatJobs);

		const client = redisClient();
		for(let job of flatJobs) {
			let {crn, otype, oid, age} = job;
			let cnt = await client.zaddAsync('RECORD:CR', 'CH', age, JSON.stringify({crn, otype, oid}));
			if(cnt > 0) {
				let msg = JSON.stringify(job);

				setTimeout(async () => {
					const lazyClient = redisClient();
					await lazyClient.saddAsync('JOBS:CR', msg);
					lazyClient.quit();
					console.log(`look back again ${msg}`);
				}, 60 * ONE_SECOND);

				await client.saddAsync('JOBS:CR', msg);
				console.log(`Observed ${msg}`);
			}
		}
		client.quit();

	} catch(e) {
		console.error(e);
	}
	setTimeout(look4NewJob, 15 * ONE_SECOND);
}

async function look4Job() {
	try {
		const jobs = await Promise.all([getJobs(10061), getJobs(10173)]);
		const flatJobs = [...jobs[0], ...jobs[1]]; //console.log(flatJobs);

		const client = redisClient();
		await client.saddAsync('JOBS:CR', flatJobs.map(obj => JSON.stringify(obj)));
		client.quit();

		console.log(`Observed ${flatJobs.length} jobs`);

	} catch(e) {
		console.error(e);
	}
	setTimeout(look4Job, 15 * ONE_MINUTE);
};

async function saveDB() {
	try {
		const client = redisClient();
		console.time('saveDB');
		await client.saveAsync();
		console.timeEnd('saveDB');
		client.quit();
	} catch(e) {
		console.error(e);
	}
	setTimeout(saveDB, 55 * ONE_MINUTE);
};

async function assignWorker() {
	try {
		const client = redisClient();
		const msg = await client.spopAsync('JOBS:CR');
		client.quit();
		if(msg) {
			//console.log(msg);
			await workOn(JSON.parse(msg));//{ crn: 'SCR-1142.0', otype: 10173, oid: '946BCB90-E274-E811-80E6-005056AB451F', age: 683400000 });
		}
		setTimeout(assignWorker, ONE_SECOND);
	} catch(e) {
		console.error(e);
		setTimeout(assignWorker, 30 * ONE_SECOND);
	}
}

if (cluster.isMaster) {
	look4Job();
	look4NewJob();
	saveDB();
	for (let i = 0; i < numThd; i++) {
		cluster.fork();
	}
} else {
	console.log(`Created worker[${process.pid}]`, new Date());
	assignWorker();
}


