const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'لا يوجد توكن دخول' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'التوكن غير صالح أو منتهي' });
    }
    req.user = decoded; // { id, role: 'admin' | 'driver', driverId? }
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'هذه الصلاحية للمشرف فقط' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin };
