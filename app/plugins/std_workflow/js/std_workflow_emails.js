/* Haplo Platform                                     http://haplo.org
 * (c) Haplo Services Ltd 2006 - 2016    http://www.haplo-services.com
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.         */


// Set a template for sending emails
P.Workflow.prototype.emailTemplate = function(template) {
    this.$instanceClass.prototype.$emailTemplate = template;
};

// Default to the email template defined in requirements.schema
P.WorkflowInstanceBase.prototype.$emailTemplate = "std:email-template:workflow-notification";

// --------------------------------------------------------------------------

// specification has keys:
//      template - Template object, or name of template within consuming plugin
//      view - view for rendering template
//      to - list of recipients
//      cc - CC list, only sent if the to list includes at least one entry
//      except - list of recipients to *not* send stuff to
//
// view is copied and additional properties added:
//      M - workflow instance
//      toUser - the user the email is being sent to
//
// Recipients lists can contains:
//      Strings as actionableBy names resolved by M.getActionableBy()
//      SecurityPrincipal objects (users or groups)
//      numeric user/group IDs (eg from the Group schema dictionary)
//      Ref of a user, looked up with O.user()
//      Anything with a ref property which is a Ref (eg StoreObject), then treated as Ref
//      An array of any of the above (nesting allowed)
//      The above allows you to use entities with code like M.entities.supervisor_list
// Note that if there's a single recipient, it can be specified without enclosing it in an array.
//
// Email subject should be set in view as emailSubject, or preferably use the emailSubject() template function

var toId = function(u) { return u.id; };

P.WorkflowInstanceBase.prototype.sendEmail = function(specification) {
    var except = this._generateEmailRecipientList(specification.except, []).map(toId);
    var to =     this._generateEmailRecipientList(specification.to,     except);
    var cc =     this._generateEmailRecipientList(specification.cc,     except.concat(to.map(toId)));

    // Obtain the message template
    var template = specification.template;
    if(!template) { throw new Error("No template specified to sendEmail()"); }
    if(typeof(template) === "string") {
        template = this.$plugin.template(template);
    }

    // Set up the initial template
    var view = _.clone(specification.view || {});
    view.M = this;

    // Get the email template
    var emailTemplate = O.email.template(this.$emailTemplate);

    // Send emails to the main recipients
    var firstBody, firstSubject, firstUser;
    to.forEach(function(user) {
        view.toUser = user;
        var body = template.render(view);
        var subject = view.emailSubject || 'Notification';
        if(!firstBody) { firstBody = body; firstSubject = subject; }    // store for CC later
        emailTemplate.deliver(user.email, user.name, subject, body);
    });

    // CCed emails have a header added
    if(cc && firstBody) {
        var ccTemplate = P.template("email/cc-header");
        view.$std_workflow = {
            unsafeOriginalEmailBody: firstBody,
            sentUser: to[0]
        };
        cc.forEach(function(user) {
            view.toUser = user;
            var body = ccTemplate.render(view);
            emailTemplate.deliver(user.email, user.name, "(CC) "+firstSubject, body);
        });
    }
};

P.WorkflowInstanceBase.prototype._generateEmailRecipientList = function(givenList, except) {
    var M = this;
    var outputList = [];
    var pushRecipient = function(r) {
        if(r && (-1 === except.indexOf(r.id)) && r.email) {
            for(var l = 0; l < outputList.length; ++l) {
                if(outputList[l].id === r.id) { return; }
            }
            outputList.push(r);
        }
    };
    _.flatten([givenList || []]).forEach(function(recipient) {
        if(recipient) {
            switch(typeof(recipient)) {
                case "string":
                    pushRecipient(M.getActionableBy(recipient));
                    break;
                case "number":
                    pushRecipient(O.securityPrincipal(recipient));
                    break;
                default:
                    if(O.isRef(recipient)) {
                        pushRecipient(O.user(recipient));
                    } else if("ref" in recipient) {
                        pushRecipient(O.user(recipient.ref));
                    } else {
                        throw new Error("Unknown recipient kind " + recipient);
                    }
                    break;
            }
        }
    });
    return outputList;
};
