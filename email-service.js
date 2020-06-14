// Script configuration
const config = {
        client_key: CLIENT_API_KEY,
        mailgun_key: MAILGUN_API_KEY,
        mailgun_domain: MAILGUN_DOMAIN,
        from: "auto@" + MAILGUN_DOMAIN,
        email_field: "email", // email field name
        admin_email: "adminEmail",
        form_fields: ["name", "message", "org"], // list of required fields
        honeypot_field: "email2" // honeypot field name
};
    
  
addEventListener("fetch", event => {
    const request = event.request;
    if (request.method === "OPTIONS") {
        event.respondWith(handleOptions(request));
    } else {
        event.respondWith(handle(request));
    }
});
  
// Helper function to return JSON response
const JSONResponse = (message, status = 200) => {
    let headers = {
        headers: {
            "content-type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },

        status: status
    };

    let response = {
        message: message
    };

    return new Response(JSON.stringify(response), headers);
};

const urlfy = obj =>
    Object.keys(obj)
        .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]))
        .join("&");
  
  
function handleOptions(request) {
    if (
        request.headers.get("Origin") !== null &&
        request.headers.get("Access-Control-Request-Method") !== null &&
        request.headers.get("Access-Control-Request-Headers") !== null
    ) {
        // Handle CORS pre-flight request.
        return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Client-Key"
        }
        });
    } else {
        // Handle standard OPTIONS request.
        return new Response(null, {
        headers: {
            Allow: "GET, HEAD, POST, OPTIONS"
        }
        });
    }
}

function authorize(request) {
    if (request.headers.get("Client-Key") !== config.client_key) {
        throw new Error('Unauthorized request')
    }
}

// Utility function to validate form fields
function validateInput(form) {
    if (form[config.honeypot_field] !== "") {
        throw new Error('Invalid request')
    }

    // Validate form inputs
    for (let i = 0; i < config.form_fields.length; i++) {
        let field = config.form_fields[i];
        if (form[field] === "") {
            throw new Error(`${field} is required`)
        }
    }

    // Validate email field
    let email_regex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (form[config.email_field] == "" || !email_regex.test(form[config.email_field])) {
        throw new Error("Please, enter valid email address")
    }
    if (form[config.admin_email] == "" || !email_regex.test(form[config.admin_email])) {
        throw new Error("No admin email address found. Please contact site administrator")
    }
}

function generateAdminOptions(form) {
    const admin_template = `
        <html>
        <head>
            <h2>New message from ${form.name}</h2>
        </head>
        <body>
            New message has been sent via website.<br><br>
            <b>Name:</b> ${form.name} <br>
            <b>Email:</b> ${form.email} <br>
            <br>
            <b>Message:</b><br>
            ${form.message.replace(/(?:\r\n|\r|\n)/g, "<br>")}
        </body>
        </html>
    `;

    let admin_data = {
        from: config.from,
        to: form.adminEmail,
        subject: `${form.org}: New message from ${form.name}`,
        html: admin_template,
        "h:Reply-To": form.email // reply to user
    };

    let admin_options = {
        method: "POST",
        headers: {
            Authorization: "Basic " + btoa("api:" + config.mailgun_key),
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": admin_data.length
        },
        body: urlfy(admin_data)
    };
    return admin_options
}

function generateUserOptions(form) {
    const user_template = `
        <html>
            <body>
                Hello ${form.name}, <br>
                <br>
                Thank you for reaching out! <br>
                <br>
                Your message has been received by ${form.org} and we will be in contact as soon as possible. <br>
                <br>
                Thank you, <br>
                ${form.org}
        </body>
        </html>
    `;

    let user_data = {
        from: config.from,
        to: form.email,
        subject: `Thank you for contacting ${form.org}!`,
        html: user_template,
        "h:Reply-To": form.adminEmail, // reply to admin
    };

    let user_options = {
        method: "POST",
        headers: {
            Authorization: "Basic " + btoa("api:" + config.mailgun_key),
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": user_data.length
        },
        body: urlfy(user_data)
    };
    return user_options
}

async function handle(request) {
    console.log(request)
    // Authenticate pre-distributed API key
    try {
        authorize(request);
    } catch (err) {
        return JSONResponse("Unauthorized request", 401);
    }

    // Validate form fields
    const form = await request.json(); 

    try {
        validateInput(form);
    } catch (err)  {
        return JSONResponse(err.message, 400);
    }

    // Construct admin and user email and options
    try { 
        const admin_options = generateAdminOptions(form);
        const user_options = generateUserOptions(form);

        // Config to submit each email
        const options = [admin_options, user_options];

        // Send admin and user emails
        try {
            await Promise.all(options.map(opt =>
                fetch(`https://api.mailgun.net/v3/${config.mailgun_domain}/messages`, opt)
                .then(response => {
                    if (response.status != 200) {
                        throw new Error("Email failed to send");
                    }
                })
                .catch(err => {
                    console.log(err)
                    throw new Error("Email failed to send");
                })
            ));
            return JSONResponse("Message has been sent");
        } catch (err) {
            return JSONResponse("Failed to send email, please contact website administrator", 500);
        }
    } catch (err) {
        return JSONResponse("Failed to generate email, please contact website administrator", 500);
    }
}
