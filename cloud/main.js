// The first deployed file must be named main.js and must be placed on the root of the cloud folder.
// The example below shows you how a cloud code function looks like.

/*
 * Parse.Cloud.define("hello", function(request, response){
 *     response.success("Hello world!");
 * });
 */

// To see it working, you only need to call it through SDK or REST API.
// Here is how you have to call it via REST API:

// If you have set a function in another cloud code file, called "test.js" (for example)
// you need to refer it in your main.js, as you can see below:

/* require("./test.js"); */

require("./functions.js")

const Event = Parse.Object.extend("Event");
const Place = Parse.Object.extend("Place");
const EventRequest = Parse.Object.extend("EventRequest");
const Comment = Parse.Object.extend("Comment");
const Settings = Parse.Object.extend("Settings");
const Notification = Parse.Object.extend("Notification");

const NotificationType = Object.freeze({
  eventRequest: { key: "EVENT_REQUEST", message: "EVENT_REQUEST_FORMAT"},
  eventUpdate: { key: "EVENT_UPDATE", message:  "EVENT_UPDATE_FORMAT"},
  eventRequestAccepted: { key: "EVENT_REQUEST_ACCEPTED", message:  "EVENT_REQUEST_ACCEPTED_FORMAT"},
  commentCreated: { key: "COMMENT_CREATED", message:  "COMMENT_CREATED_FORMAT"}
});

const logger = require('parse-server').logger;

/**
 * Add two numbers together
 * @param  {Parse.User} user The user that will receive the notification
 * @param  {Parse.User} relatedUser The user related to the notification
 * @param  {Event} relatedEvent The event related to the notification
 * @param  {NotificationType} type The type of notification
 */
function sendNotification(user, relatedUser, relatedEvent, type){

  var pushQuery = new Parse.Query(Parse.Installation);
  pushQuery.equalTo('user', user);

  var notification = new Notification();
  notification.set("forUser", user);
  notification.set("relatedUser", relatedUser);
  notification.set("relatedEvent", relatedEvent);
  notification.set("type", type.key);
  notification.set("message", type.message);

  var acl = new Parse.ACL();
  acl.setReadAccess(user.id, true);
  acl.setWriteAccess(user.id, true);

  notification.setACL(acl);

  notification.save()
  .then((eventRequest) => {
    // Execute any logic that should take place after the object is saved.
    console.log('New object created with objectId: ' + notification.id);
  }, (error) => {
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.error('Failed to create new object, with error code: ' + error.message);
  });

  if (type == NotificationType.eventRequest) {
    Parse.Push.send({
      where: pushQuery,
      useMasterKey: true,
      data: {
        "title" : "Someone wants to join! 🥳",
        "alert" : "@" + relatedUser.get("username") + " requested to join " + relatedEvent.get("name")
      }
    }, {
      useMasterKey: true
    });
  }

  if (type == NotificationType.commentCreated) {
    Parse.Push.send({
      where: pushQuery,
      useMasterKey: true,
      data: {
        "title" : relatedEvent.get("name"),
        "alert" : "@" + relatedUser.get("username") + " left a new message"
      }
    }, {
      useMasterKey: true
    });
  }

}

// Save
Parse.Cloud.beforeSave("Event", (request) => {

  var user = request.user;

  if (user == null && !request.master) {
    throw "You need to be authenticated 😏. What are you doing 🌚?";
  }

  if (!request.object.isNew()) {
    request.context = { isEditing: true };
    return
  }

  request.object.set("createdBy", user)
  request.object.set("isAvailable", true)

  var acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setWriteAccess(user.id, true);

  request.object.setACL(acl);
});

Parse.Cloud.afterSave("Event", (request) => {

  const context = request.context;

  if (context.isEditing === true) {
    const event = request.object;
    const user = event.get("createdBy");

    var queryEventRequest = new Parse.Query(EventRequest);
    queryEventRequest.equalTo("event", event);

    queryEventRequest.find()
    .then(function(eventRequests) {
      for (var i = 0; i < eventRequests.length; i++) {
        let currentUser = eventRequests[i].get("user");
        if (user.id === currentUser.id) {
          continue;
        }
        sendNotification(currentUser, null, event, NotificationType.eventUpdate);
      }
    })
    .catch(function(error) {
      logger.error("sending notification Event " + error.code + " : " + error.message);
    });

    return
  }

  // Create a new instance of that class.
  var eventRequest = new EventRequest();
  eventRequest.set("user", request.user);
  eventRequest.set("event", request.object);
  eventRequest.set("isAccepted", true);

  eventRequest.save({}, {useMasterKey:true})
  .then((eventRequest) => {
    // Execute any logic that should take place after the object is saved.
    console.error('New object created with objectId: ' + eventRequest.id);
  }, (error) => {
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.error('Failed to create new object, with error code: ' + error.message);
  });
});

Parse.Cloud.beforeSave("EventRequest", (request) => {

  var user = request.user;

  if (user == null && !request.master) {
    throw "🐲: You need to be authenticated 😏. What are you doing 🌚?";
  }

  if (request.object.isNew()) {
    if (!request.master) {
      request.object.set("user", user);
    }
  } else {
    const relatedUser = request.object.get("user");
    const relatedEvent = request.object.get("event");

    request.context = { isEditing: true };
    if (request.object.get("isAccepted") === true) {
      sendNotification(relatedUser, null, relatedEvent, NotificationType.eventRequestAccepted)
    }
  }
});

Parse.Cloud.afterSave("EventRequest", (request) => {

  const context = request.context;
  const eventRequest = request.object;

  if (context.isEditing === true) {
    return
  }

  eventRequest.fetchWithInclude(["user","event"]).then((fetchedEventRequest) => {
    const relatedUser = fetchedEventRequest.get("user");
    const relatedEvent = fetchedEventRequest.get("event");

    var forUser = relatedEvent.get("createdBy")
    if (forUser.id === relatedUser.id) {
      return
    }
    sendNotification(forUser, relatedUser, relatedEvent, NotificationType.eventRequest);
  }, (error) => {
    // The object was not refreshed successfully.
    logger.log("Unable to fetch object");
  });

  relatedEvent.fetch().then((fetchedRelatedEvent) => {
    var forUser = fetchedRelatedEvent.get("createdBy")
    if (forUser.id === relatedUser.id) {
      return
    }
    sendNotification(forUser, relatedUser, relatedEvent, NotificationType.eventRequest);
  }, (error) => {
    // The object was not refreshed successfully.
    logger.log("Unable to fetch object");
  });
});

Parse.Cloud.beforeSave("Comment", (request) => {

  var user = request.user;

  if (user == null && !request.master) {
    throw "You need to be authenticated 😏. What are you doing 🌚?";
  }

  request.object.set("createdBy", user)

  var acl = new Parse.ACL();
  acl.setPublicReadAccess(true);
  acl.setWriteAccess(user.id, true);

  request.object.setACL(acl);
});

Parse.Cloud.afterSave("Comment", (request) => {

  var currentUser = request.user;

  if (currentUser == null && !request.master) {
    throw "You need to be authenticated 😏. What are you doing 🌚?";
  }

  const event = request.object.get("event");
  const user = request.object.get("createdBy");

  var queryEventRequest = new Parse.Query(EventRequest);
  queryEventRequest.equalTo("event", event);
  queryEventRequest.include("event,user");

  queryEventRequest.find()
  .then(function(eventRequests) {

    var sender = user;
    for (var i = 0; i < eventRequests.length; i++) {
      let currentUser = eventRequests[i].get("user");
      if (user.id === currentUser.id) {
        sender = currentUser;
        break;
      }
    }

    for (var i = 0; i < eventRequests.length; i++) {
      let currentEvent = eventRequests[i].get("event");
      let currentUser = eventRequests[i].get("user");
      if (user.id === currentUser.id) {
        continue;
      }
      sendNotification(currentUser, sender, currentEvent, NotificationType.commentCreated);
    }
  })
  .catch(function(error) {
    logger.error("sending notification Event " + error.code + " : " + error.message);
  });

});

// Block
Parse.Cloud.beforeSave("Block", (request) => {

  const user = request.user;

  if (user == null && !request.master) {
    throw "You need to be authenticated 😏. What are you doing 🌚?";
  }

  request.object.set("blocker", user)

  const blockedUser = request.object.get("blocked");


  if (blockedUser == null && !request.master) {
    throw "No user to block. What are you doing 🌚?";
  }

  var acl = new Parse.ACL();
  acl.setPublicReadAccess(false);
  acl.setWriteAccess(user.id, true);
  acl.setReadAccess(user.id, true);
  acl.setReadAccess(blockedUser,true);

  request.object.setACL(acl);
});

// User
Parse.Cloud.beforeSave(Parse.User, async (request) => {

  if (request.object.get("settings") != null) {
    return;
  }

  request.context = { isCreatingSettings: true };

  var settings = new Settings();

  await settings.save()

  request.object.set("settings", settings);
});

Parse.Cloud.afterSave(Parse.User, (request) => {
  var user = request.object;

  const context = request.context;

  if (context.isCreatingSettings === true) {
    var settings = request.object.get("settings")

    var acl = new Parse.ACL();
    acl.setReadAccess(user.id,true);
    acl.setWriteAccess(user.id, true);

    settings.setACL(acl);

    settings.save()
  }

});

// Delete

Parse.Cloud.beforeDelete("Event", (request) => {
  var event = request.object;

  var queryEventRequest = new Parse.Query(EventRequest);
  queryEventRequest.equalTo("event", event);

  queryEventRequest.find()
  .then(function(eventRequests) {
    for (var i = 0; i < eventRequests.length; i++) {
      eventRequests[i].destroy()
    }
  })
  .catch(function(error) {
    logger.error("beforeDelete Event " + error.code + " : " + error.message);
  });
});

// Find

Parse.Cloud.beforeFind("Event", async (request) => {
  let query = request.query;
  query.include("createdBy");
});

Parse.Cloud.afterFind("Event", async (request) => {

  var events = request.objects;
  var user = request.user;

  if (request.master) {
    return events;
  }

  var fixedObjects = [];

  for (var i = 0; i < events.length; i++) {

    var event = events[i];

    event.set("place", null);

    fixedObjects.push(event);
  }

  return fixedObjects;
});
