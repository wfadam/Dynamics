const redis = require('redis');
const bluebird = require('bluebird');
const path = require('path');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const redisClient = () => redis.createClient(6380, 'localhost');
const R = require('ramda');
const dayOfst = -30;

const offsetDate = days => {
	let past = new Date();
	past.setDate(past.getDate() + days);
	return past;
}

const toJson = () => arr => arr.map(s => JSON.parse(s));
const join = sep => arr => arr.map(tcr => tcr.join(sep));
const delEmptyColumn = () => arr => arr.map(cols => cols.filter(col => col));
const fmtCRN = (msg = '') => {
			let arr = msg.match(/^([TS]CR-\d+)(\.\w+)?(\.\d+)$/);
			return arr ? arr[1] + arr[3] : '';
		};
const addLocalLink = path => val => `<a href="/${path}/${encodeURIComponent(val)}">${val}</a>`;
const addCRLink = val => `<a href="/tcr/${encodeURIComponent(fmtCRN(val))}">${val}</a>`;

function filterByString(msg) {
	const regex = new RegExp(`${msg}`, 'i');
	return arr => arr.filter(s => s.match(regex));
}

function matchInProps(msg, ...props) {
	const regex = new RegExp(`\\b${msg}\\b`, 'i');
	return arr => arr.filter(tcr => {
		for(let prop of props) {
			if(tcr[prop] && tcr[prop].match(regex)) {
				return true;	
			};
		};
		return false;
	});
}

function startsWithInProps(msg, ...props) {
	const regex = new RegExp(`\\b${msg}`, 'i');
	return arr => arr.filter(tcr => {
		for(let prop of props) {
			if(tcr[prop] && tcr[prop].match(regex)) {
				return true;	
			};
		};
		return false;
	});
}

function includesInProps(msg, ...props) {
	const regex = new RegExp(msg, 'i');
	return arr => arr.filter(tcr => {
		for(let prop of props) {
			if(tcr[prop] && tcr[prop].match(regex)) {
				return true;	
			};
		};
		return false;
	});
}

function takeLast () {
	return objArr => {
		const knownTCR = new Map();
		objArr.reverse().forEach(j => {
			if(! knownTCR.has(j['crn'])) {
				knownTCR.set(j['crn'], j);
			}
		});
		return [...knownTCR.values()];
	}
}

function sortByProp(prop) {
	return arr => {
		let validArr = arr.map(tcr => {
			tcr[prop] = tcr[prop] || '1/1/9999';
			return tcr;
		});
		return validArr.sort((oA, oB) => Date.parse(oB[prop]) - Date.parse(oA[prop]))
	};
}

function flatProps(...props) {
	return arr => arr.map(tcr => props.map(key => {
		return tcr[key] ? tcr[key].trim() : '';
	}));
};

function dayNdate(str) {
	const date = new Date(str);
	return `${date.toDateString().split(' ')[0]} ${date.toLocaleDateString()}`;
};

function mapProps(fn, ...props) {
	return arr => arr.map(tcr => {
		props.forEach(prop => {
			if(tcr[prop]) {
				tcr[prop] = fn.call(null, tcr[prop]);
			}
		});
		return tcr;
	});
};

const replace = (from, to) => str => str.replace(from, to);

function boldMoreThan(limit, fontSize = 4) {
	return val => Date.parse(val) >= limit ? `<b><font size=${fontSize}>${val}</font></b>` : val;
}

function colorMatch(expStr, cc = '#DC143C;') {
	return val => val.match(expStr) ? `<b><span style='color:${cc}'>${val}</span></b>` : val;
}

const filter = (fn4 = val => val, fn3 = val => val, fn2 = val => val, fn1 = val => val) => R.compose(
	join(' | '),
	delEmptyColumn(),
	flatProps('zsd_commitdate', 'crn', 'zsd_testtimetestflow', 'createdby', 'zsd_stage', 'zsd_screquestname', 'zsd_productdescription', 'zsd_tcrrequestname', 'zsd_assignedte', 'modifiedon'),
	mapProps(addCRLink, 'crn'),
	mapProps(addLocalLink('queue'), 'zsd_assignedte', 'createdby'),
	mapProps(colorMatch(/assigned|submitted|manager/i, '#00FF00;'), 'zsd_stage'), 
	mapProps(colorMatch(/development/i, '#FF00FF;'), 'zsd_stage'), 
	mapProps(replace(/in progress/ig, ''), 'zsd_stage'),
	mapProps(replace(/[ ]+/g, ' '), 'zsd_productdescription', 'zsd_tcrrequestname'),
	mapProps(replace(/(T5773|T5831)[ ]+\(.*\)/g, '$1'), 'zsd_tcrrequestname'),
	mapProps(boldMoreThan(Date.parse((new Date()).toDateString())), 'zsd_commitdate'), 
	mapProps(dayNdate, 'zsd_commitdate'),
	matchInProps('active', 'statecode'),
	fn4,
	fn3,
	fn2,
	fn1,
	toJson()//,
//	filterByString(`"zsd_tcrrequestname"`)
);


function escapeChars(msg) {
	return msg.replace(/[()]/g, '\\$&');
}

function timeDiff(str) {
	const now = Date.now();
	const msecAgo = Date.parse(str);
	const days	= Math.floor((now - msecAgo)/1000 / (3600 * 24));
	const hours	= Math.floor((now - msecAgo)/1000 % (3600 * 24) / 3600);
	const mins	= Math.floor((now - msecAgo)/1000 % (3600 * 24) % 3600 / 60);
	return `${days}D${hours}h${mins}m ago`.replace(/^0D(0h)*/, '');
}

async function getQueue(people) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(people);
	return filter(
		sortByProp('zsd_commitdate'),
		matchInProps(safeMsg, 'ownerid' ,'createdby' ,'zsd_assignedte' ,'zsd_assignedtpe' ,'zsd_assignedsdsste' ,'zsd_assignedtotpe'),
		takeLast()
	)(arr);
}

async function getQueueArray(people) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(people);
	return R.compose(
		join(' | '),
		flatProps('crn', 'zsd_stage'),
		sortByProp('zsd_commitdate'),
		matchInProps(safeMsg, 'ownerid' ,'createdby' ,'zsd_assignedte' ,'zsd_assignedtpe' ,'zsd_assignedsdsste' ,'zsd_assignedtotpe'),
		matchInProps('active', 'statecode'),
		takeLast(),
		toJson()
	)(arr);

}

async function getStage(msg, category = '(mt|bi|kgd)') {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(msg);
	return filter(
		sortByProp('modifiedon'),
		matchInProps(safeMsg, 'zsd_stage'),
		matchInProps(category, 'zsd_category'),
		takeLast()
	)(arr);
}

async function getTp(msg) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(msg);
	return filter(
		sortByProp('zsd_commitdate'),
		startsWithInProps(safeMsg, 'zsd_testprogamname'),
		takeLast()
	)(arr);
}

async function getTitle(msg) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(msg);
	return filter(
		sortByProp('modifiedon'),
		includesInProps(safeMsg, 'zsd_purpose', 'zsd_tcrrequestname', 'zsd_productdescription', 'zsd_screquestname'),
		//matchInProps(safeMsg, 'zsd_purpose', 'zsd_tcrrequestname', 'zsd_productdescription', 'zsd_screquestname'),
		takeLast()
	)(arr);
}

async function getHistory(msg) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
	client.quit();
	const safeMsg = escapeChars(msg);
	return filter(
		matchInProps(safeMsg, 'crn')
	)(arr).reverse();
}

async function getLab(lastDays = 3) {
	const client = redisClient();
	const arr = await client.zrangebyscoreAsync('lab:log', Date.parse(offsetDate(-lastDays)), Date.now()); 
	client.quit();
	const slimArr = arr.map(msg => {
		let {crn, host, time, zsd_assignedte, zsd_stage, zsd_productdescription, pwd, proName} = JSON.parse(msg);
		if(crn) crn = `<a href="/tcr/${crn}">${crn}</a>`
		if(zsd_stage) zsd_stage = colorMatch(/draft|manager|assigned|submitted/i, '#00FF00;')(zsd_stage);
		if(zsd_stage) zsd_stage = colorMatch(/development/i, '#FF00FF;')(zsd_stage);
		if(pwd) pwd = pwd.replace(/\/home\/(kei|fsdiag)\//, '').replace(/sandbox\/(users\/)*/, '');
			if(pwd) user = pwd.match('/') ? pwd.slice(0, pwd.match('/').index) : pwd;
			return [host, timeDiff(time), user, crn || proName, zsd_stage, zsd_assignedte, zsd_productdescription, pwd]
				.filter(fd => fd)
				.join(' | ')
				.slice(0, 240);
		});
	return slimArr.reverse();
}

function embedLink(str) {
	return str.slice(0)
		.replace(/SCR[ ]*&#8211;[ ]*/ig, 'SCR-')
		.replace(/SCR[-]?(\d+)[\.p](\d+)/ig, `<a href="/scr/SCR-$1.$2">$&</a>`)
		.replace(/TCR-(\d+)\.(\d+)*/ig, `<a href="/tcr/TCR-$1.$2">$&</a>`);
}

function takeFirstInProp(prop) {
	return objArr => {
		const known = new Map();
		objArr.forEach(j => {
			if(! known.has(j[prop].toUpperCase())) {
				known.set(j[prop].toUpperCase(), j);
			}
		});
		return [...known.values()];
	}
}

function slice(st, sp) {
	return str => str.slice(st, sp);
}

const toZipFileName = (str = '') => path.basename(path.dirname(str));
const pickUserName = (str = '') => str.replace(/(\/(home|kei|fsdiag|sandbox|users))*/, '').split('/')[1];
const pickUserNZipName = (str = '') => [pickUserName(str), toZipFileName(str)].join('/');
const dummyFn = val => val;

const tbCommonPipe = (fn5 = dummyFn, fn4 = dummyFn, fn3 = dummyFn, fn2 = dummyFn, fn1 = dummyFn) => R.compose(
		join(' | '),
		delEmptyColumn(),
		flatProps('time', 'pwd'),  //'host'
		fn5,
		fn4,
		fn3,
		fn2,
		fn1,
		combine2Json
	);

function combine2Json(arr = []) {
	const jArr = [];
	for(let i = 0; i < arr.length; i += 2) {
		jArr.push(Object.assign(
			{time: new Date(Number(arr[i + 1])).toLocaleString()},
			JSON.parse(arr[i])
		)); 
	}
	return jArr;
}

async function getNewTb() {
	const client = redisClient();
	const arr = await client.zrevrangeAsync('LIST:TB', 0, -1); 
	client.quit();

	return arr.map(tb => {
		let result = tb.match(/_scr(\d+)[^_]*p(\d+)/i)
		let scr = result ? `SCR-${result[1]}.${result[2]}` : '';
		return scr ? `${addLocalLink('scr')(scr)} | ${addLocalLink('tb')(tb)}` : addLocalLink('tb')(tb);
	});
}

async function getTb(name = '', lastDays = 30) {
	const client = redisClient();
	//const arr = await client.zrangebyscoreAsync(name, Date.parse(offsetDate(-lastDays)), Date.now(), 'withscores'); 
	const arr = await client.zrangeAsync(name, 0, -1, 'withscores'); 
	client.quit();

	const descArr = tbCommonPipe(
		mapProps(pickUserNZipName, 'pwd'),
		includesInProps(/_(1znm|1ynm|bics)/i, 'pwd')
	)(arr).reverse();
	return descArr;
}

exports.getDayOfst = () => dayOfst;
exports.getQueue = getQueue;
exports.getQueueArray = getQueueArray;
exports.getLab = getLab;
exports.getTb = getTb;
exports.getNewTb = getNewTb;
exports.getStage = getStage;
exports.getTp = getTp;
exports.getTitle = getTitle;
exports.getHistory = getHistory;

if(require.main === module) {
	(async () => {
		console.time('Query');
		//console.log(await getQueue('Grace Liu'));
		//console.log(await getTb('tb__437__SCREEN_column_pointer_VDD_p4m4_DDR_200MHz_scr997p1__nvcc'));
		console.log(await getNewTb());
		console.timeEnd('Query');
		process.exit();
	})();
}

