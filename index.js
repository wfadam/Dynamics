const cluster = require('cluster');
const redis = require('redis');
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = () => redis.createClient(6380, 'localhost');
const {workOn} = require('./CRWorker.js');
const {getJobs} = require('./crawl.js');
const numThd = require('os').cpus().length;
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;
const ONE_DAY = 24 * 3600 * 1000;

const client = redisClient();
const JOB_NEW = 'JOBS:NEW:CR';
const JOB = 'JOBS:CR';


async function renewJob(winBegin = -60, winEnd = -7) {
	try {
		let now = Date.now();
		let ofstBegin = now + winBegin * ONE_DAY;
		let ofstEnd = now + winEnd * ONE_DAY;

		let arr = await client.zrangebyscoreAsync('RECORD:CR', ofstBegin, ofstEnd);
		for(let msg of arr) {
			client.saddAsync(JOB, msg); //console.log(`Observed ${msg}`);
		}
		console.log(`renewed ${arr.length} CRs`);

	} catch(e) {
		console.error(e);
	}
	setTimeout(renewJob, 180 * ONE_MINUTE);
}

async function look4NewJob() {
	try {
		const jobs = await Promise.all([getJobs(10061), getJobs(10173)]);
		const flatJobs = [...jobs[0], ...jobs[1]]; //console.log(flatJobs);
		for(let job of flatJobs) {
			let {crn, otype, oid, age} = job;
			let cnt = await client.zaddAsync('RECORD:CR', 'CH', age, JSON.stringify({crn, otype, oid}));
			if(cnt > 0) {
				const msg = JSON.stringify(job);
				await client.saddAsync(JOB_NEW, msg);
				console.log(`Observed ${msg}`);
			}
		}
	} catch(e) {
		console.error(e);
	}
	setTimeout(look4NewJob, 10 * ONE_SECOND);
}


async function look4Job() {
	try {
		const jobs = await Promise.all([getJobs(10061), getJobs(10173)]);
		const flatJobs = [...jobs[0], ...jobs[1]]; //console.log(flatJobs);

		await client.saddAsync(JOB, flatJobs.map(obj => JSON.stringify(obj)));

		console.log(`Observed ${flatJobs.length} jobs`);

	} catch(e) {
		console.error(e);
	}
	setTimeout(look4Job, 60 * ONE_MINUTE);
};

function assignWorker(jobKind = '', delay = 0) {
	async function worker() {
		const msg = await client.spopAsync(jobKind);
		if(! msg) {
			setTimeout(worker, 5 * ONE_SECOND);
			return;
		}

		setTimeout(async () => {
			try {
				await workOn(JSON.parse(msg))
			} catch(e) { // bad json 
				console.error(e);
			}

			setTimeout(worker, 0);

		}, Math.max(delay, 0));

	}

	return worker;
}

//------------------------------------------------------------------

if (cluster.isMaster) {

	look4NewJob();
	renewJob();
	//look4Job();

	for (let i = 0; i < numThd; i++) {
		cluster.fork();
	}

} else {
		console.log(`Created worker[${process.pid}]`, new Date());
		assignWorker(JOB_NEW, 5 * ONE_SECOND)();
		assignWorker(JOB)();
		assignWorker(JOB)();
		assignWorker(JOB)();
}


