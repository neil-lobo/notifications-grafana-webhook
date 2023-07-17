require("dotenv").config();
const express = require("express");
const app = express();

const PORT = process.env.PORT ?? 3001;

if (!process.env.PROXIED_URL) {
    console.log("Missing 'PROXIED_URL' environment variable!");
    process.exit(1);
}

const proxiedUrl = new URL(process.env.PROXIED_URL)

function createNotification(alert, messageString) {
    const message = JSON.parse(messageString);
    const messageKey = message.options.message;
    const titleKey = message.options.title;
    return {
        label: message.label,
        options: {
            from: "Grafana",
            message: alert.annotations[messageKey] ?? "<no msg>",
            title: alert.annotations[titleKey]
        }
    };
}

async function sendNotification(notification, auth) {
    let res;
    try {
        res = await fetch(proxiedUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": auth
            },
            body: JSON.stringify(notification)
        });
        return res.status;
    } catch(err) {
        console.error(new Date().toLocaleString(), err);
        return 502;
    }
}

async function sendNotifications(notifications, auth) {
    let n = [];

    for(const notification of notifications) {
        n.push(sendNotification(notification, auth));
    }

    return await Promise.all(n);
}

app.use(express.json())
app.post("/", async (req, res) => {
    const notifications = [];

    for(const alert of req.body.alerts) {
        if (alert.status === "firing" && alert.labels.alertName !== "DatasourceNoData") {
            notifications.push(createNotification(alert, req.body.message));
            console.log(new Date().toLocaleString());
            console.log(alert);
        }
    }

    let statuses = await sendNotifications(notifications, req.headers.authorization);

    for(const status of statuses) {
        if (status !== 200) {
            console.error(statuses);
            return res.status(502).send();
        }
    }

    res.status(200).send();
})

app.listen(PORT, () => {
    console.log(`Listening | Proxying [POST http://localhost:${PORT}] to [POST ${proxiedUrl.href}]`);
})