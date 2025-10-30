const axios = require('axios');
const { format } = require('date-fns');

async function testTimeService() {
    const baseUrl = 'http://localhost:3000/api/time';
    
    try {
        console.log('Testing Time Service...\n');
        
        // Test 1: Get current time based on client IP
        console.log('Test 1: Get current time based on client IP');
        const currentTimeResponse = await axios.get(`${baseUrl}/current`);
        console.log('Current Time Response:', {
            status: currentTimeResponse.status,
            data: currentTimeResponse.data,
            formattedTime: format(new Date(currentTimeResponse.data.currentTime), 'yyyy-MM-dd HH:mm:ss XXX')
        });
        
        // Test 2: Get time for a specific timezone
        console.log('\nTest 2: Get time for a specific timezone');
        const timezone = 'America/Sao_Paulo';
        const timezoneResponse = await axios.get(`${baseUrl}/timezone/${encodeURIComponent(timezone)}`);
        console.log(`Time for ${timezone}:`, {
            status: timezoneResponse.status,
            data: timezoneResponse.data,
            formattedTime: format(new Date(timezoneResponse.data.currentTime), 'yyyy-MM-dd HH:mm:ss XXX')
        });
        
        console.log('\n✅ Time Service tests completed successfully!');
    } catch (error) {
        console.error('❌ Error testing Time Service:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testTimeService();
}

module.exports = { testTimeService };
