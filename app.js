const express = require('express')
const app = express();
const fs = require('fs');
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const path = require('path')

const websiteSchema = require('./modules/website')
const userSchema = require('./modules/user')
const filerHandel = require('./modules/saveZipAndExptractZip');
const genPath = require('./modules/generatePathOfSource')
const isAuthenticated = require('./middleware/isAuthencated')
const getFolderNameFromRequest = require('./middleware/getFolderName')
require('dotenv').config();

app.set("view engine", "ejs");
app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'))
// here we make specific folder static for every request
app.use(async (req, res, next) => {
    let folderName = ''
    let referer = req.get('referer');
    if (referer) {
        const segments = referer.split('/');
        const lastSegment = segments.pop();
        const previousSegment = segments.pop();
        folderName = await getFolderNameFromRequest(previousSegment);
    }
    express.static(`./public/websites/${folderName}/public`)(req, res, next);
});
app.get('/', function (req, res) {
    res.render('index')
});
// Authentication
app.get('/register', function (req, res) {
    res.render('register-page')
});
app.post('/register', async function (req, res) {
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(req.body.password, salt);
        const { userName, password, email, phoneNumber } = req.body;
        const user = await userSchema.create({
            userName,
            password: hash,
            email,
            phoneNumber
        });
        const token = jwt.sign({ userName, password }, process.env.JWT_SECRET);
        res.cookie("secret", token, {
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.redirect('/dashboard')
    } catch (err) {
        res.status(500).send({ message: err.message }); // Send a generic error message
    }
});
app.get('/login', function (req, res) {
    res.render('login-page')
});
app.post('/login', async function (req, res) {
    const { userName, password } = req.body;
    try {
        const user = await userSchema.findOne({ userName });
        if (!user) {
            return res.status(400).send("Enter Valid details");
        }
        if (bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ userName, password }, process.env.JWT_SECRET);
            res.cookie("secret", token, {
                httpOnly: true,
                maxAge: 30 * 24 * 60 * 60 * 1000
            });
            res.redirect('/dashboard')
        }
    } catch (err) {
        res.status(500).send(err.message);
    }

});
app.get('/logout', function (req, res) {
    res.clearCookie('secret');
    res.redirect('/dashboard')
});
// Website features
app.get('/dashboard', isAuthenticated, async function (req, res) {
    try {
        const docs = await websiteSchema.find({ owner: req.auth._id })
            .sort({ _id: -1 })
            .limit(4);
        res.render('dashboard', { docs, port: process.env.PORT })
    } catch (err) {
        res.render('error-403')
    }

});
app.get('/change/domain', function (req, res) {
    res.render('domainchange')
});
app.post('/change/domain', isAuthenticated, async function (req, res) {
    const { oldName, newName } = req.body;
    try {
        const website = await websiteSchema.findOneAndUpdate(
            { websiteName: oldName },
            { $set: { websiteName: newName } });
        res.redirect('/sites');
    } catch (err) {
        res.render('/error-403')
    }
})
app.post('/delete/:website', isAuthenticated, async function (req, res) {
    console.log("Hello mother father")
    try {
        const website = await websiteSchema.findOneAndDelete({ websiteName: req.params.website }); // Using query parameter for simplicity
        if (!website) {
            return res.status(404).render('error-404')
        }
        const user = await userSchema.findOneAndUpdate({ _id: website.owner },
            { $pull: { websites: website._id } }
        );
        res.status(200).redirect('/sites')
    } catch (err) {
        console.error(err);
        res.status(500).send({ message: "An error occurred while processing your request." });
    }
});
app.get('/create/website', isAuthenticated, function (req, res) {
    res.render('add-new-site')
});
app.post('/create/website', isAuthenticated, filerHandel.upload.single('folder'), async function (req, res) {
    let filePath = '';
    try {
        filePath = await filerHandel.extractZip(req.file.filename, req.file.path);
    } catch (err) {
        console.log(err)
        return res.status(500).send("Server Side error can't store file")
    }
    try {
        const userData = await userSchema.findOne({ userName: req.auth.userName });
        if (userData) {
            const website = await websiteSchema({
                websiteName: req.file.filename.split('.')[0],
                defaultPageName: req.body.defaultPageName,
                owner: userData._id,
                visibility: true,
                filePath: filePath.split('.')[0],
                backUpPath: req.file.path
            })
            userData.websites.push(website._id);
            await website.save();
            await userData.save();
            res.redirect('/sites')
        } else {
            return res.send("user  Not found")
        }

    } catch (err) {
        res.send(err)
    }

});
app.get('/resentsites', isAuthenticated, async function (req, res) {
    try {
        const docs = await websiteSchema.find({ owner: req.auth._id })
            .sort({ _id: -1 })
            .limit(4);
        res.send(docs)
    } catch (err) {
        res.render('error-403')
    }

})
app.get('/:website/setting', isAuthenticated, async function (req, res) {
    try {
        const website = await websiteSchema.findOne({ websiteName: req.params.website });
        console.log(website)
        res.render('more-settings', { websiteName: website.websiteName, defaultPageName: website.defaultPageName, visibility: website.visibility });
    } catch (err) {
        res.render('error-404')
    }

})
app.post('/:website/setting', async function (req, res) {
    const { domain, defaultPageName, visibility } = req.body;
    console.log(domain, defaultPageName, visibility);
    res.status(200);
    try {
        const updatedWebsite = await websiteSchema.findOneAndUpdate(
            { websiteName: req.params.website },
            { $set: { websiteName: domain, defaultPageName, visibility } },
            { new: true, runValidators: true }
        );
        if (!updatedWebsite) {
            return res.status(404).send("Website not found");
        }
        res.redirect(`/${domain}/setting`)
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred while updating the website domain.");
    }
})
// Visit website
app.get('/:websitedomain/webhost.web.app', async function (req, res) {
    try {
        const website = await websiteSchema.findOne({ websiteName: req.params.websitedomain });
        if (!website) {
            return res.status(404).render('error-404')
        }
        if (website.visibility) {
            fs.readFile(`.${website.filePath}/public/${website.defaultPageName}`, (err, data) => {
                if (err) {
                    console.log(err)
                    return res.send(err)
                }
                if (data) {
                    res.end(data)
                } else {
                    res.render("error-404")
                }
            })
        } else {
            res.render('error-403')
        }

    } catch (err) {
        res.status(400).send(err)
    }
});
app.get('/sites', isAuthenticated, async function (req, res) {
    console.log(req.auth._id)
    try {
        const websites = await websiteSchema.find({ owner: req.auth._id });
        res.render('all-sites', { websites, domain: process.env.DOMAIN })
    }
    catch(err){
        res.render("error-403")
    }
});
app.get("*", function (req, res) {
    res.render('error-404')
})
app.listen(process.env.PORT);