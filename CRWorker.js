const redis = require('redis');
const bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const options = require("./auth.js").options;
const httpntlm = require('httpntlm');
const {getDocumentList} = require('./sharePoint.js');
const {queryNewTb} = require('./parseXml.js');
const R = require('ramda');
const redisClient = () => redis.createClient(6380, 'localhost');

const getDataURL = (otyp, uid) => `http://dynamics.sandisk.com/Dynamics/form/Data.aspx?etc=${otyp}&id=%7b${uid}%7d&oid=${uid}`;
const getPageURL = (otyp, uid) => `http://dynamics.sandisk.com/Dynamics/main.aspx?etc=${otyp}&id=%7b${uid}%7d&newWindow=true&pagetype=entityrecord`;

function flatProps(...props) {
	return (obj = {}) => {
		let slimObj = {};
		Object.keys(obj).forEach(key => {
			slimObj[key] = props.map(p => obj[key][p]).toString();
		});
		return slimObj;
	}
}

function filterKey(pat = '') {
	return (obj = {}) => {
		let thin = {};
		Object.keys(obj)
			.filter(k => k.match(pat))
			.forEach(k => thin[k] = obj[k]);
		return thin;
	};
}

const clean = R.compose(
	flatProps('value'),
	filterKey(/^[^_]/)
);

function xmlPath(obj = {}) {
	for(let key in obj) {
		if(key.toLowerCase().endsWith('.xml')) {
			return obj[key];
		}
	}
	return '';
}

async function fetchJson(otyp, uid) {
	return new Promise((resolve, reject) => {
		const url = getDataURL(otyp, uid);
		httpntlm.get(Object.assign({url: url}, options), (err, res) => {
			try {
				let {formData} = JSON.parse(res.body.replace('while(1);', ''));
				resolve(formData);
			} catch(e) {
				reject(e);
			}});
	});
}

async function workOn({crn, otype, oid}) {
	const [json, doc] = await Promise.all([fetchJson(otype, oid), getDocumentList(otype, oid)]);
	const obj = clean(json); 

	if(Number.isNaN(Date.parse(obj['modifiedon']))) {
		return console.error('bad object', crn, obj);
	}

	const xmlUrl = xmlPath(doc);
	if(xmlUrl) {
		let arr = await queryNewTb(xmlUrl);
		obj['NEWTB'] = arr.join('<BR>');
	}

	obj['DOC'] = JSON.stringify(doc);
	obj['URL'] = getPageURL(otype, oid);

	const client = redisClient();
	await Promise.all([
		client.hmsetAsync(crn, obj),
		client.zaddAsync('TIMELINE:CR', Date.parse(obj['modifiedon']), JSON.stringify(summarize(crn, obj)))
	]);
	client.quit();
	console.log('Updated',  JSON.stringify({crn, otype, oid}));
}

function summarize(crn, obj = {}) {
	const keys = [
		'zsd_commitdate',
		'zsd_category',
		'zsd_purpose',
		'zsd_stage',
		'zsd_pemanager',
		'ownerid',
		'modifiedon',
		'statecode',
		'createdby',
		'zsd_assignedte',
		'zsd_assignedtotpe',
		'zsd_assignedtpe',
		'zsd_assignedsdsste',
		'zsd_assignedspe',
		'zsd_speassignedto',
		'zsd_testtime',
		'zsd_testprogamname',
		'zsd_programimpact',
		'zsd_testtimetestflow',
		'zsd_productdescription',
		'zsd_tcrrequestname',
		'zsd_screquestname'
	];

	let rtnObj = {crn};
	keys.forEach(k => {
		if(obj[k] && obj[k].trim()) {
			rtnObj[k] = obj[k];
		}});
	return rtnObj;
}

if(require.main === module) {
	(async () => {
		try {
			//await workOn({ crn: 'SCR-1142.0', otype: 10173, oid: '946BCB90-E274-E811-80E6-005056AB451F', age: 683400000 });
			//await workOn({ crn: 'TCR-24420.5', otype: 10061, oid: '6961ccb0-55e6-e811-80e8-005056ab4520', age: 783400000 });
			await workOn({ crn: 'TCR-26555.0', otype: 10061, oid: '463391b9-9839-e911-80e9-005056ab4520', age: 783400000 });
			//await workOn({ crn: 'TCR-24168.3', otype: 10061, oid: '047ee292-a018-e911-80e9-005056ab451f', age: 783400000 });

		} catch(e) {
			console.error(e);
		}
	})();
}

exports.workOn = workOn;

