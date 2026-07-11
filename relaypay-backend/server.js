const env = require('./src/config/env');
const { connectToMongoDB } = require('./src/config/db');

const {app} = require('./src/app');

connectToMongoDB();

const PORT = env.PORT  
app.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
})
