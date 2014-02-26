var Q = require('q');
var fs = require('fs-extra');
var crypto = require('crypto');

var qGlobal = {};


//send out our global object
module.exports = qGlobal;

qGlobal.qReadFile = function(file)
{
	var defer = Q.defer();
	var reject = function() { defer.reject.apply(this, arguments); };
	var success = function() { defer.resolve.apply(this, arguments); };
	
	fs.readFile(file, function(err, buffer)
	{
		if(err) reject(err);
		else success(buffer);
	});

	return defer.promise;
}

qGlobal.qReadJSON = function(file)
{
	// if(!file){
	// 	var err = new Error("No arguments provided");
	// 	err.name = "QNoArguments";
	// 	reject(err);
	// }

	var defer = Q.defer();
	var reject = function() { defer.reject.apply(this, arguments); };
	var success = function() { defer.resolve.apply(this, arguments); };
	
	fs.readJSON(file, function(err, data)
	{
		if(err) reject(err);
		else success(data);
	});

	return defer.promise;
}


qGlobal.qWriteJSON = function(file, jObject)
{
	// if(!file){
	// 	var err = new Error("No arguments provided");
	// 	err.name = "QNoArguments";
	// 	reject(err);
	// }

	var defer = Q.defer();
	var reject = function() { defer.reject.apply(this, arguments); };
	var success = function() { defer.resolve.apply(this, arguments); };
	
	fs.outputJSON(file, jObject, function(err)
	{
		if(err) reject(err);
		else success();
	});

	return defer.promise;
}

qGlobal.qExists = function(pathLocation)
{
	var defer = Q.defer();
	var reject = function() { defer.reject.apply(this, arguments); };
	var success = function() { defer.resolve.apply(this, arguments); };
	
	//check if something exists or not
	fs.exists(pathLocation, function(err, data)
	{
		if(err) reject(err);
		else success(data);
	});

	return defer.promise;
}


qGlobal.qMD5ChecksumStream = function(stream)
{
	var defer = Q.defer();
	var reject = function() { defer.reject.apply(defer, arguments); };
	var success = function() { defer.resolve.apply(defer, arguments); };
	
	
	var shasum = crypto.createHash('md5');

	//update on data for the checksum
	stream.on('data', function(d) {
	  shasum.update(d);
	});

	//when we're all done, create our checksum hex, and send along
	stream.on('end', function() {
  		var d = shasum.digest('hex');
 		success(d);
	});

	//make sure to catch any errors
	stream.on("error", reject);


	return defer.promise;
}

qGlobal.qMD5Checksum = function(fileLocation)
{
	//pull in our designated fileLocation (probably newly created tarball)
	var s = fs.ReadStream(fileLocation);

	//send the stream for checksumming, it'll let us know when it's done
	return qGlobal.qMD5ChecksumStream(s);	
}


