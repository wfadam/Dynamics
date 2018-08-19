const SSH = require('simple-ssh');
const redis = require('redis');
const bluebird = require("bluebird");
const redisClient = () => redis.createClient(6380, 'localhost');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
const qstr= require('querystring');
const cluster = require('cluster');
const ssh_config = {
	user: Buffer.from([ 114, 111, 111, 116 ]).toString(),
	pass: Buffer.from([ 97, 100, 118, 97, 110, 116, 101, 115, 116 ]).toString(),
};

global.T73Hosts = [
	'es2', 'es13', 'es10', 'es14', 'es18', 'es19', 'es21', 'es22', 'es23', 'es24', 'es26', 'es32', 'es33', 'es36', //'es12', 'es1'
	//SDSM--
	//'10.91.203.11',
	//'10.91.203.12',
	//'10.91.203.13',
	//SDUS--
	//'10.195.225.243',	//  T5773-SD3 
	//'10.195.226.111',	//  T5773-SD4 
	//'10.195.226.108',	//  T5773-SD7 
	//'10.195.226.224',	//  T5773-SD12 
	//'10.195.225.216',	//  T5773-SD15 
	//'10.195.226.215', //  T5773-SD16
	//'10.195.226.208',	//  T5773-SD17 
	//'10.195.225.51',	//  T5773-SD20 
	//--
];

global.T31Hosts = [
	'sd5', 'sd6', 'sd8', 'sd10', 'sd11', 'sd19', 'sd20', 'sd21', 'sd22', 'sd30',
	//SDSM--
	//'10.91.202.32',
	//SDUS--
	//'10.195.225.72',
	//'10.195.225.236',  //T5831-SD2
	//'10.195.226.84',   //T5831-SD7
	//'10.195.225.79',   //T5831-SD9
	//'10.195.225.73',   //T5831-SD16
	//--
];

function dispatchWorkersOn(arr = []) {
	arr.forEach(host => {
		const worker = cluster.fork();
		worker.send(host);
		worker.on('message', msg => console.log(msg));
	});
}

function getTasks(opt) {
	switch(opt) {
		case '73':
			return T73Hosts;
		case '31':
			return T31Hosts;
		default:
			throw new Error(`Unknown option ${opt}`);
	}
}

//^^^^^^^^^^^^^ Above functions used by the master only

if(cluster.isMaster) {
	['31', '73'].forEach(o => dispatchWorkersOn(getTasks(o)));
	return;
} else {
	process.on('message', host => {
		getStatus(host);
		setInterval(() => getStatus(host), 15 * 60 * 1000);
	});
}

//VVVVVVVVVVVVV Below functions used by workers only

const probe = host => {
	return new Promise((resolve, reject) => {
		let msg = '';
		new SSH(Object.assign({host}, ssh_config)).exec(genCmd(), {
			out: chunk => msg += chunk,
			exit: code => {
				if(code !== 0) reject(`ExitCode = ${code}`);
				else resolve(msg);
			}
		}).start();
	});
}

const dayOfst = -90;

const offsetDate = days => {
	let past = new Date();
	past.setDate(past.getDate() + days);
	return past;
}

const getStatus = async host => {
	try {
		const msg = await probe(host);
		const {sts = '', pro = '', pwd = '', tsec1 = '', tsec2 = ''} = qstr.parse(msg, '\n');
		if(! tsec1 && ! tsec2) {
			return;
		}

		const client = redisClient();
		const tsec = tsec1 || tsec2;
		const proName = pro.replace('.class', '').replace(/javaapi[./]/, '');
		const time = new Date(tsec * 1000).toLocaleString();
		const jobj = {host, time, proName, pwd};

		let dbObj = {};
		const arr = await client.zrangebyscoreAsync('TIMELINE:CR', Date.parse(offsetDate(dayOfst)), Date.now()); 
		const regex = new RegExp(proName, 'i');
		for(let line of arr.reverse()) {
			if(line.match(regex)) {
				let {crn, zsd_assignedte, zsd_stage, zsd_productdescription} = JSON.parse(line);
				dbObj = {crn, zsd_assignedte, zsd_stage, zsd_productdescription};
				break;
			}
		}

		const stat = sts.replace(/INIT\'D (READY)*/, '').trim() || 'READY';

		const comboMsg = JSON.stringify(Object.assign(jobj, dbObj, {stat}));
		const cnt = await client.zaddAsync('lab:log', tsec * 1000, comboMsg);
		client.quit();
		if(cnt !== 0) console.log(comboMsg);

	} catch(e) {
		return console.error({host, e});
	}
}

const genCmd = () => {
	const t73cmdL = `eval '
user=$(kwho | grep -o -P 'kei_\d');
echo "pwd="$(kpwd | tail -n1);
echo "pro="$(kproset | tail -n1);
echo "sts="$(kstat --system | tail -n1);
echo "tsec1="$(stat -c "%Y" /dev/shm/ATKEI/kei_1/UTSC_Shm__utsc_pf.shm);
echo "tsec2="$(stat -c "%Y" /dev/shm/ATKEI/kei_2/UTSC_Shm__utsc_pf.shm)'`;

	const t31cmdL = `eval '
echo "pwd="$(fspwd | tail -n1);
echo "pro="$(fsproset | tail -n1);
echo "sts="$(fsstat --system | tail -n1);
echo "tsec1="$(stat -c "%Y" /dev/shm/ATFS/fsdiag_1/UTSC_Shm__utsc_pf.shm);
echo "tsec2="$(stat -c "%Y" /dev/shm/ATFS/fsdiag_2/UTSC_Shm__utsc_pf.shm)'`;

	return `which kstat &> /dev/null && ${t73cmdL} || ${t31cmdL}`;
}

