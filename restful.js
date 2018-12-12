"use strict"
const cluster = require('cluster');
const bluebird = require("bluebird");
const {getDayOfst, getQueue, getQueueArray, getLab, getNewTb, getTb, getStage, getTp, getTitle, getHistory} = require("./query.js");
const express = require('express');
const app = express();
const redis = require("redis");
const router = express.Router();
const client = redis.createClient(6380, 'localhost');
const entities = require("entities");
const path = require('path');
const R = require('ramda');
const PORT = 3000;
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

client.on("error", err => {
	throw new Error(err);
});

if (cluster.isMaster) {
	const numThd = require('os').cpus().length * 2;
	for(let i = 0; i < numThd; i++) {
		cluster.fork();
	}
} else {

	router.use((req, res, next) => {
		saveIP(req);
		console.log([req.method, req.url, req.ip, `Worker[${cluster.worker.id}]`, (new Date()).toString()].join('  '));
		next(); // make sure we go to the next routes and don't stop here
	});

	app.use('/', router);
	app.listen(PORT, () => console.log(`RESTful Dynamics is listening on port ${PORT}`));

	function send(res, arr) {
		res.send(arr.length > 0 
			? `${arr.length} in ${Math.abs(getDayOfst())} days` + '<BR>' + arr.join('<BR>')
				: 'nothing');
	}

	function saveIP(req) {
		client.hincrby('IP_CNTR', req.ip, 1);
		client.hset('ACCESS_DATE', req.ip, (new Date()).toString());
	}

	const openAttrs = {
		'zsd_category': 'CATEGORY',
		'zsd_tcrrequestname': 'TITLE',
		'zsd_screquestname': 'SCR_TITLE',
		'zsd_productdescription': 'PRODUCT',
		'zsd_packagetype': 'PACKAGE',
		'zsd_testprogamname': 'PROGRAM',
		'zsd_testtimetestflow': 'FLOW',
		'zsd_testtime': 'TT',
		'zsd_currentstagename': 'STAGE',
		'statuscode': 'STATUS',
		'zsd_stagestatus': 'PROGRESS',
		'URL': 'URL',
		'zsd_releasetype': 'RELEASE',
		'zsd_detailscomments': 'REQUEST',
		'zsd_referencebasetestprogramlink': 'BASE_PRO',
		'zsd_sourcecodelink': 'OUT_PRO',
		'zsd_tcrnumber': 'TCR',
		'zsd_scrnumber': 'SCR',
		'createdby': 'CREATEDBY',
		'ownerid': 'OWNER',
		'zsd_assignedte': 'TE',
		'zsd_assignedsdsste': 'TE2',
		'zsd_productengineer': 'SCR_PE',
		'zsd_assignedtpe': 'PE',
		'zsd_assignedtotpe': 'TPE',
		'zsd_commitdate': 'COMMIT',
		'zsd_forecastdate': 'FORECAST',
		'zsd_testartdate': 'START',
		'zsd_teenddate': 'STOP',
		'modifiedon': 'MODT',
		'DOC': 'DOC',
	};

	function copy(attrs = {}) {
		return obj => {
			const rtnObj = {};
			Object.keys(attrs).forEach(key => {
				if(obj[key]) {
					rtnObj[attrs[key]] = obj[key].trim();
				}
			});
			return rtnObj;
		};
	}

	function mapProps(fn, ...props) {
		return tcr => {
			props.forEach(prop => {
				if(tcr[prop]) {
					tcr[prop] = fn(tcr[prop]);
				}
			});
			return tcr;
		};
	};

	function addFileLink(str) {
		try {
			let fobj = JSON.parse(str);
			return Object.keys(fobj).reduce((acc, cur) => acc + `<BR>${addLink(cur)(fobj[cur])}` , '');
		} catch(err) {
			return str;
		}
	}

	function embedLink(str) {
		return str.slice(0)
			.replace(/SCR[ ]*&#8211;[ ]*/ig, 'SCR-')
			.replace(/SCR[-]*(\d+)[.p]*(\d+)*/ig, `<a href="/scr/SCR-$1.$2">$&</a>`)
			.replace(/TCR[ ]*&#8211;[ ]*/ig, 'TCR-')
			.replace(/TCR[-]*(\d+)[.p]*(\d+)*/ig, `<a href="/tcr/TCR-$1.$2">$&</a>`);
	}

	function addBorder(str) {
		let border = '<BR>==============================================================<BR>';
		return border + str + border;
	}

	const addLocalLink = path => val => `<a href="/${path}/${encodeURIComponent(val)}">${val}</a>`;
	const addLink = name => link => `<a href="${link}">${name}</a>`;
	const color = (cc = '#DC143C;') => val => `<b><span style='color:${cc}'>${val}</span></b>`;

	const trans = R.compose(
		mapProps(color('#FF00FF;'), 'PROGRAM', 'FLOW'),
		mapProps(addLocalLink('tcr'), 'TCR'),
		mapProps(addLocalLink('queue'), 'CREATEDBY', 'TE', 'TE2', 'SCR_PE', 'PE', 'TPE', 'OWNER'),
		mapProps(addBorder, 'REQUEST'),
		mapProps(embedLink, 'REQUEST'),
		mapProps(addFileLink, 'DOC'),
		mapProps(addLink('Dynamics'), 'URL')
	);

	const tuneNum = raw => {
		if(! raw.includes('.')) return raw + '.0';
		if(raw.endsWith('.')) return raw + '0';
		return raw;
	}

	const crHandler = (req, res) => {
		let key = tuneNum(req.params.crn.toUpperCase());
		client.hgetall(key, (err, value) => {
			if(err) return res.send(err);
			if(! value) return res.send('nothing');
			const flow = value['zsd_testtimetestflow'];
			const status = value['statuscode'];
			const obj = trans(copy(openAttrs)(value));
			const msg = Object.keys(openAttrs).reduce((acc, cur) => {
				const openKey = openAttrs[cur];
				if(obj[openKey])	return acc +`${openKey}: ${entities.decodeHTML(obj[openKey])}<BR>`; 
				else return acc;
			}, '');
			res.send(`<head><title>${key}&nbsp;&nbsp;${flow || status}&nbsp;&nbsp;${value['zsd_stage'] || ''}</title></head>` + msg);
		});
	}

	router.route('/tcr/:crn').get(crHandler);
	router.route('/scr/:crn').get(crHandler);

	router.route('/json/:crn').get((req, res) => {
		let key = tuneNum(req.params.crn.toUpperCase());
		client.hgetall(key, (err, value) => {
			if(err) return res.send(err);
			if(! value) return res.send('{}');
			const obj = copy(openAttrs)(value);
			res.send(`<pre>${JSON.stringify(obj, null, 4)}</pre>`);
		});
	});

	function bindUrlFunc(url, fn, ...args) {
		router.route(url).get(async (req, res) => {
			const arr = await fn(...args.map(s => req.params[s]));
			send(res, arr);
		});
	}

	bindUrlFunc('/queue/:name', getQueue, 'name');
	bindUrlFunc('/list/:name', getQueueArray, 'name');
	bindUrlFunc('/stage/:name', getStage, 'name');
	bindUrlFunc('/stage/:name/:category', getStage, 'name', 'category');
	bindUrlFunc('/tp/:name', getTp, 'name');
	bindUrlFunc('/title/:name', getTitle, 'name');
	bindUrlFunc('/newtb', getNewTb);
	bindUrlFunc('/tb/:name', getTb, 'name');
	bindUrlFunc('/lab', getLab);
	bindUrlFunc('/lab/:lastDays', getLab, 'lastDays');

	router.route('/history/:tcr').get(async (req, res) => {
		const key = tuneNum(req.params.tcr.toUpperCase());
		const arr = await getHistory(key);
		send(res, arr);
	});

	router.route('/tcr/:tcr/:fd').get((req, res) => {
		const key = tuneNum(req.params.tcr.toUpperCase());
		const field = req.params.fd.toUpperCase();
		for(const entry of Object.entries(openAttrs)) {
			if(entry.includes(field)) {
				client.hget(key, entry[0], (err, value) => {
					if(err) return res.send(err);
					res.send(value || 'nothing');
				});
				return;
			}
		}
		res.send('nothing');
	});
}

