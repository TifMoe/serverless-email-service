// Script configuration
const config = {
        client_key: CLIENT_API_KEY,
        mailgun_key: MAILGUN_API_KEY,
        mailgun_domain: MAILGUN_DOMAIN,
        from: "auto@" + MAILGUN_DOMAIN, // eventually I'll parameterize the sender based on client API key
        admin_email: ADMIN_EMAIL,
        email_field: "email", // email field name
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
}

function generateAdminOptions(form) {
    const admin_template = `
        <html>
        <head>
            <title>New message from ${form.name}</title>
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
        to: config.admin_email,
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
        Hello ${form.name}, \n
        Thank you for contacting ${form.org}! \n
        I have received your message and I will get back to you as soon as possible.
    `;

    let user_data = {
        from: config.from,
        to: form.email,
        subject: `Thank you for contacting ${form.org}!`,
        html: user_template,
        "h:Reply-To": config.admin_email // reply to admin
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

        // Send admin and user emails
        try {
            let results = await Promise.all([
                fetch(`https://api.mailgun.net/v3/${config.mailgun_domain}/messages`, admin_options),
                fetch(`https://api.mailgun.net/v3/${config.mailgun_domain}/messages`, user_options)
            ]);
            console.log(results);
            return JSONResponse("Message has been sent");

        } catch (err) {
            return JSONResponse("Failed to send email, please contact website administrator", 500);
        }
    } catch (err) {
        return JSONResponse("Failed to generate email, please contact website administrator", 500);
    }
}