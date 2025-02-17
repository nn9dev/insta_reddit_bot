// load basic packages
const console = require('console');
const process = require('process');

console.log("Initializing...");

// load custom packages
const igHandler = require("./handlers/instagram.js");
const postStatus = require("./handlers/poststatus.js");
const redditHandler = require("./handlers/reddit.js");
redditHandler.setPostStatus(postStatus);
const discordBot = require("./handlers/discordbot.js");
discordBot.setPostStatus(postStatus);

// retrieve settings
const settings = require('./settings.json');

// retrieve CLI arguments
const args = process.argv.slice(2);
const debugMode = args.indexOf("-debug") > -1;
const forceIg = debugMode && args.indexOf("-forceig") > -1;

let bot_loop_running = false;
function bot_loop(loggedInUser) {
	bot_loop_running = true;
	// set subreddit
	if (!debugMode) {
		if (typeof settings.reddit.subreddits == "string") {
			// only 1 subreddit has been set in settings.json as a string
			redditHandler.setSubreddit(settings.reddit.subreddits);
		}
		else if (typeof settings.reddit.subreddits == "object") {
			// subreddit(s) have been given as an object in settings.json
			// check if chances of subreddits appearing's sum == 100...
			// if this is not the case, the below function could get slow rather quickly.
			if (Object.values(settings.reddit.subreddits).reduce(function(a, b) { return a + b; }, 0) == 100) {
				// create a temporary array for later
				let tempArray = [];
				for (let item in settings.reddit.subreddits) {
					if (settings.reddit.subreddits.hasOwnProperty(item)) {
						// add each subreddit to the temporary array for as many times
						// as the appearance percentage given in settings.json
						for (let i = 0; i < settings.reddit.subreddits[item]; i++) {
							tempArray.push(item);
						}
					}
				}
				// select a random subreddit from the temporary array
				redditHandler.setSubreddit(tempArray[Math.floor(Math.random() * tempArray.length)]);
			}
			else {
				throw Error("Subreddit's appearance sum does not equal exactly 100");
			}
		}
		else {
			throw Error("Cannot figure out what JS type the subreddit key is (in settings.json)");
		}
	}
	else {
		let debugPostId = args[args.indexOf("-debug") + 1];
		if (debugPostId == null || debugPostId == undefined || debugPostId.trim().lenth == "") {
			throw Error("No post to debug given");
		}
		redditHandler.setPostToDebug(debugPostId);
		console.warn("Debugging mode active!");
	}

	try {
		// retrieve a post that is still on the to-do list
		redditHandler.getPostToDo().then(function(redditPost) {
			igHandler.handleRedditPost(redditHandler, redditPost, debugMode && !forceIg)
				.then(function() {
					console.log("All done!");
				})
				.catch(function(err) {
					console.warn("Unable to handle post!");
					console.error(err);
					discordBot.sendSystemMessage("Unable to handle a post!\n" + err.toString());
				})
				.finally(function() {
					bot_loop_running = false;
				});
		}).catch(function(err) {
			console.warn("Failed to retrieve a post to do!");
			console.error(err);
			discordBot.sendSystemMessage("Failed to retrieve a post to do.\n" + err.toString());
			bot_loop_running = false;
		});
	}
	catch(err) {
		console.warn("An error occurred!");
		console.error(err);
		discordBot.sendSystemMessage("An error occurred!\n" + err.toString());
		bot_loop_running = false;
	};
}

function intervaller(loggedInUser) {
	let date = new Date();
	let scheduleThisHour = settings.schedule.hourly_timings[date.getHours()];
	let curMinute = date.getMinutes();
	if (scheduleThisHour.length > 0) {
		for (let i in scheduleThisHour) {
			if (scheduleThisHour[i] == curMinute) {
				if (!bot_loop_running) {
					console.log("");
					console.log("========================================");
					console.log("");
					console.log("");
					console.log("");
					console.log("It's time to post!");
					bot_loop(loggedInUser);
				}
				else {
					console.warn("Bot was supposed to run right now, but it's still running from a previous time!");
				}
				break;
			}
		}
	}
}

function start_bot(loggedInUser) {
	if (debugMode) {
		bot_loop(loggedInUser);
		return;
	}
	console.log("Starting bot...");
	intervaller(loggedInUser);
	setInterval(function() {
		intervaller(loggedInUser);
	}, 60000);
	console.log("Bot started.");
	console.log("Current schedule:");
	for (let i = 0; i < 24; i++) {
		console.log(i.toString() + " 'o clock: " + JSON.stringify(settings.schedule.hourly_timings[i]));
	}
}

// initialize Instagram client
igHandler.init(settings.instagram);
if (!debugMode || forceIg) {
	let date = new Date();
	console.log("Current time: " + date.getHours() + ":" + date.getMinutes());
	igHandler.signIn(settings.instagram.username, settings.instagram.password)
		.then(start_bot)
		.catch(function(err) {
			console.warn("Could not sign in to Instagram");
			console.error(err);
		});
}
else {
	console.log("Running in debug mode!");
	start_bot(null);
}