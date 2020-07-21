
const Event = Parse.Object.extend("Event");
const EventRequest = Parse.Object.extend("EventRequest");
const Settings = Parse.Object.extend("Settings");
const Notification = Parse.Object.extend("Notification");

const NotificationType = Object.freeze({
  eventRequest: { key: "EVENT_REQUEST", message: "EVENT_REQUEST_FORMAT"},
  eventUpdate: { key: "EVENT_UPDATE", message:  "EVENT_UPDATE_FORMAT"},
  eventRequestAccepted: { key: "EVENT_REQUEST_ACCEPTED", message:  "EVENT_REQUEST_ACCEPTED_FORMAT"}
});

/**
 * Add two numbers together
 * @param  {Parse.User} user The user that will receive the notification
 * @param  {Parse.User} relatedUser The user related to the notification
 * @param  {Event} relatedEvent The event related to the notification
 * @param  {NotificationType} type The type of notification
 */
function sendNotification(user, relatedUser, relatedEvent, type){

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
}
