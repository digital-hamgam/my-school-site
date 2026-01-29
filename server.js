const express = require('express');
const mongoose = require('mongoose');
const ZarinpalCheckout = require('zarinpal-checkout');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// دریافت اطلاعات از متغیرهای محیطی
const MERCH_ID = process.env.ZARINPAL_MERCHANT || '00000000-0000-0000-0000-000000000000';
const MONGO_URI = process.env.MONGO_URI; 
const APP_URL = process.env.APP_URL; 

// اتصال به دیتابیس
if(MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('DB Connected')).catch(err => console.log(err));
}

// مدل کاربر
const UserSchema = new mongoose.Schema({
    token: String,
    isPaid: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

app.use(cookieParser());
app.use(express.static('public'));

// بررسی اشتراک
const checkAuth = async (req, res, next) => {
    const userToken = req.cookies.user_token;
    if (!userToken) return res.redirect('/');
    
    const user = await User.findOne({ token: userToken, isPaid: true });
    if (user) {
        next();
    } else {
        res.redirect('/');
    }
};

// روت‌های اصلی
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family:tahoma; text-align:center; margin-top:50px;">
            <h1>سایت آموزشی و شبیه‌ساز</h1>
            <p>برای دسترسی به شبیه‌سازها و فایل‌ها باید اشتراک تهیه کنید.</p>
            <a href="/pay" style="background:green; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">خرید اشتراک (۵۰,۰۰۰ تومان)</a>
        </div>
    `);
});

app.get('/dashboard', checkAuth, (req, res) => {
    res.send(`
        <div style="font-family:tahoma; direction:rtl; text-align:center;">
            <h1>پنل کاربری</h1>
            <hr>
            <h3>شبیه‌سازها:</h3>
            <a href="/simulations/density.html">آزمایشگاه چگالی</a> | 
            <a href="/simulations/numberline.html">محور اعداد</a> | 
            <a href="/simulations/magnet.html">قطب‌نما</a>
            <hr>
            <h3>فایل‌ها:</h3>
            <p>فایل‌های PDF و ویدیوهای شما اینجا قرار می‌گیرند.</p>
        </div>
    `);
});

// دسترسی به پوشه مخفی (فقط بعد از پرداخت)
app.use('/simulations', checkAuth, express.static(path.join(__dirname, 'protected/simulations')));
app.use('/files', checkAuth, express.static(path.join(__dirname, 'protected/files')));

// پرداخت
app.get('/pay', async (req, res) => {
    // ایجاد یک توکن موقت برای کاربر
    const tempToken = Math.random().toString(36).substring(7);
    res.cookie('user_token', tempToken, { maxAge: 90000000, httpOnly: true });

    // ذخیره اولیه در دیتابیس
    await new User({ token: tempToken, isPaid: false }).save();

    const zarinpal = ZarinpalCheckout.create(MERCH_ID, true); // true = محیط تست
    const response = await zarinpal.PaymentRequest({
        Amount: 50000,
        CallbackURL: `${APP_URL}/verify?token=${tempToken}`,
        Description: 'خرید اشتراک',
    });
    if (response.status === 100) res.redirect(response.url);
    else res.send('خطا در درگاه');
});

app.get('/verify', async (req, res) => {
    const { Authority, Status, token } = req.query;
    if (Status !== 'OK') return res.send('پرداخت ناموفق');

    const zarinpal = ZarinpalCheckout.create(MERCH_ID, true);
    const response = await zarinpal.PaymentVerification({
        Amount: 50000,
        Authority: Authority,
    });

    if (response.status === 100 || response.status === 101) {
        await User.findOneAndUpdate({ token: token }, { isPaid: true });
        res.redirect('/dashboard');
    } else {
        res.send('تراکنش تایید نشد');
    }
});

app.listen(PORT, () => console.log('Server started'));
