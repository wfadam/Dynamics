const cheerio = require('cheerio');
const options = require("./auth.js").options;
const httpntlm = require('httpntlm');
const getAge = (...strs) => Math.abs(Date.parse(strs[0]) - Date.parse(strs[1]));
const url = otype => `http://dynamics.sandisk.com/Dynamics/_root/homepage.aspx?etc=${otype}&pagemode=iframe`;
const isDate = str => str.match(/^\d+/) && str.match(/ (AM|PM)$/);
//const isCRNum = str => str.match(/^[TS]CR-\d+\.\d+$/);
const isCRNum = str => str.match(/^[TS]CR-\d+(\.(\w+))+$/);
const isOID = str => str.match(/^{[0-9A-Z-]+}$/);
const isInterested = msg => isDate(msg) || isCRNum(msg) || isOID(msg); 
const removeCurly = str => str.slice(1, -1);

exports.getJobs = getJobs;

async function getJobs(otype) {
	const cells = await parsePage(otype);
	const jobs = cells.map(row => toObj(otype, row.filter(isInterested)));
	return jobs;
}

function toObj(otype, arr) {
	let crn;
	let oid;
	let timeArr = [];
	for(let fd of arr) {
		if(isCRNum(fd)) crn = fd;
		if(isOID(fd)) oid = removeCurly(fd);
		if(isDate(fd)) timeArr.push(fd);
	}
	const age = getAge(...timeArr);
	return {crn, otype, oid, age};
}

function parsePage(otype) {
	return new Promise((resolve, reject) => {
		httpntlm.get(Object.assign({url: url(otype)}, options), 
			(err, res) => {
				return res['statusCode'] === 200
					?	resolve(getCellMatrix(otype, res.body))
					: reject(err, res);
			});
	});
}

function getCellMatrix(otype, html) {
	const $ = cheerio.load(html);
	const rows = $(`tr[otype=${otype}]`);
	const matrix = [];
	for(let i = 0; i < rows.length; i += 1) {
		const oneRow = rows[i];
		const arr = [oneRow.attribs.oid];
		const spans = $('span[tabindex=0]', oneRow);
		for(let k = 0; k < spans.length; k += 1) {
			const firstChild = spans[k].children[0];
			if(firstChild) {
				arr.push(firstChild['data']);
			}
		}
		matrix.push(arr);
	}
	return matrix;
}

if(require.main === module) {
	(async () => {
		console.log(await getJobs(10173));
	})();
}

