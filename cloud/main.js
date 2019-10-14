// The first deployed file must be named main.js and must be placed on the root of the cloud folder.
// The example below shows you how a cloud code function looks like.

/*
 * Parse.Cloud.define("hello", function(request, response){
 *     response.success("Hello world!");
 * });
 */

// To see it working, you only need to call it through SDK or REST API.
// Here is how you have to call it via REST API:

/*
 * curl -X POST \
 * -H "X-Parse-Application-Id: 6UcvC2yYalNccIUzGa067RYWhCPeD4prd5pXsFWG" \
 * -H "X-Parse-REST-API-Key: dYJPLDwQIwNaUDM3yUnoDHbqOfEG4QPCLAWpWrPg" \
 * -H "Content-Type: application/json" \
 * -d "{}" \
 * https://parseapi.back4app.com/functions/hello
 */

// If you have set a function in another cloud code file, called "test.js" (for example)
// you need to refer it in your main.js, as you can see below:

/* require("./test.js"); */

const logger = require('parse-server').logger;

Parse.Cloud.beforeSave("Event", (request) => {

  var user = request.user;

  if (user == null) {
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
    return
  }

  const EventRequest = Parse.Object.extend("EventRequest");

  // Create a new instance of that class.
  var eventRequest = new EventRequest();
  eventRequest.set("user", request.user);
  eventRequest.set("event", request.object);
  eventRequest.set("isAccepted", true);

  eventRequest.save()
  .then((eventRequest) => {
    // Execute any logic that should take place after the object is saved.
    console.error('New object created with objectId: ' + eventRequest.id);
  }, (error) => {
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.error('Failed to create new object, with error code: ' + error.message);
  });
});

Parse.Cloud.afterFind("Event", async (request) => {

  var events = request.objects;
  var user = request.user;

  if (request.master) {
    return events;
  }

  const EventRequest = Parse.Object.extend("EventRequest");

  var fixedObjects = [];

  for (var i = 0; i < events.length; i++) {
    var event = events[i];

    var userRequests = [];
    if (user != null) {

      const userRequestsQuery = new Parse.Query(EventRequest);
      userRequestsQuery.equalTo("user", user);
      userRequestsQuery.equalTo("event", event);
      userRequestsQuery.equalTo("isAccepted", true);
      userRequests = await userRequestsQuery.first();

      if (userRequests != null) {
        event.set("isAttending", true);
        fixedObjects.push(event);
        continue
      } else {
        event.set("isAttending", false);
      }
    }

    event.set("location", null);
    event.set("coordinate", null);

    fixedObjects.push(event);
  }

  return fixedObjects;
})
