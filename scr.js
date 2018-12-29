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
	//SDSS--
	'es1', 'es2', 'es13', 'es10', 'es14', 'es18', 'es19', 'es21', 'es22', 'es23', 'es24', 'es26', 'es32', 'es33', 'es36', //'es12'
	//SDUS--
	'10.195.225.243',		//Advantest_SD3:   
	'10.195.226.111',   //Advantest_SD4:   
	'10.11.40.146',     //Advantest_SD5:   
	'10.196.154.13',    //Advantest_SD6:   
	'10.195.226.108',   //Advantest_SD7:   
	'10.195.226.223',   //Advantest_SD11:  
	'10.195.226.224',   //Advantest_SD12:  
	'10.195.225.216',   //Advantest_SD15:  
	'10.195.226.215',   //Advantest_SD16:  
	'10.195.226.208',   //Advantest_SD17:  
	'10.195.226.151',   //Advantest_SD31:  
	'10.195.225.157',   //Advantest_SD30:  
	'10.195.225.51',    //Advantest_SD20:  
	'10.195.225.225',	//es8
	'10.195.226.155',	//es28
	'10.195.226.161',	//es29
	'10.195.226.252', //sd24
	//SDSM--
	'10.91.203.11',
	'10.91.203.12',
	'10.91.203.13',
	//--
];

global.T31Hosts = [
	//SDSS--
	'sd5', 'sd6', 'sd8', 'sd10', 'sd11', 'sd19', 'sd20', 'sd21', 'sd22', 'sd30',
	//SDUS--
	'10.195.225.236',		//T5831_SD2:   
	'10.195.226.84',		//T5831-SD7
	'10.195.225.79',		//T5831_SD9:   
	'10.195.225.73',		//T5831-SD16:
	'10.195.225.72',		//T5831_SD18:  
	//SDSM--
	'10.91.202.32',
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
		setInterval(() => getStatus(host), 5 * 60 * 1000);
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
		const {flow = '', pro = '', pwd = ''} = qstr.parse(await probe(host), '\n');
		let currFlow = flow.split(' ');
		currFlow.shift();
		currFlow = currFlow.filter(s => {return s !== 'End' && s !== 'Of' && s !== 'Flow'});
		if(currFlow.length === 0) {
			console.log({host, time: new Date().toLocaleString()});
			return;
		}

		const proName = pro.replace('.class', '').replace(/javaapi./, '');
		const msec = Date.now();

		const client = redisClient();
		await Promise.all(currFlow.map(async tb => await client.zaddAsync(tb, 'NX', msec, JSON.stringify({host, proName, pwd})))); 
		await Promise.all(currFlow.map(async tb => {
			let arr = tb.match(/_scr(\d+)/i);
			let scrNum = arr ? arr[1] : 0;
			return await client.zaddAsync('LIST:TB', scrNum, tb);
		}));
		client.quit();
		console.log({host, time: new Date().toLocaleString()});

	} catch(e) {
		return console.error({host, e});
	}
}

const genCmd = () => {
	const t73cmdL = `eval '
echo "pwd="$(kpwd | tail -n1);
echo "pro="$(kproset | tail -n1);
echo "flow="$(utsc_pf_readdata UTPFV_TestNameList1_1)'`;

	const t31cmdL = `eval '
echo "pwd="$(fspwd | tail -n1);
echo "pro="$(fsproset | tail -n1);
echo "flow="$(utsc_pf_readdata UTPFV_TestNameList1_1)'`;

	return `which kstat &> /dev/null && ${t73cmdL} || ${t31cmdL}`;
}

