const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
    console.log('🧪 Testing Demographics API Endpoints...\n');

    try {
        // Test 1: Get all demographic templates
        console.log('1️⃣ Testing GET /api/demographics/templates');
        const templatesResponse = await fetch(`${BASE_URL}/api/demographics/templates`);
        
        if (templatesResponse.ok) {
            const templatesData = await templatesResponse.json();
            console.log('✅ Success:', templatesData.success);
            console.log('📊 Templates count:', templatesData.count);
            console.log('📝 Sample template:', templatesData.data[0]?.field_label || 'None');
        } else {
            console.log('❌ Failed:', templatesResponse.status, templatesResponse.statusText);
        }

        console.log('');

        // Test 2: Get categorized templates
        console.log('2️⃣ Testing GET /api/demographics/templates/categories');
        const categoriesResponse = await fetch(`${BASE_URL}/api/demographics/templates/categories`);
        
        if (categoriesResponse.ok) {
            const categoriesData = await categoriesResponse.json();
            console.log('✅ Success:', categoriesData.success);
            console.log('📊 Total fields:', categoriesData.totalFields);
            console.log('📂 Categories:', Object.keys(categoriesData.data));
        } else {
            console.log('❌ Failed:', categoriesResponse.status, categoriesResponse.statusText);
        }

        console.log('');

        // Test 3: Test with a survey ID (assuming survey ID 1 exists)
        console.log('3️⃣ Testing GET /api/surveys/1/demographics/config');
        const configResponse = await fetch(`${BASE_URL}/api/surveys/1/demographics/config`);
        
        if (configResponse.ok) {
            const configData = await configResponse.json();
            console.log('✅ Success:', configData.success);
            console.log('📋 Survey has demographics:', configData.data.survey?.has_demographics);
            console.log('⚙️ Config exists:', !!configData.data.config);
        } else {
            console.log('❌ Failed:', configResponse.status, configResponse.statusText);
            const errorData = await configResponse.json();
            console.log('📝 Error:', errorData.error);
        }

        console.log('');

        // Test 4: Create a simple demographics configuration
        console.log('4️⃣ Testing POST /api/surveys/1/demographics/config');
        const createConfigData = {
            demographic_type: 'simple',
            selected_fields: [1, 2, 3], // Age, Gender, Country
            is_required: false,
            consent_text: 'We collect this information to better understand our survey participants.'
        };

        const createConfigResponse = await fetch(`${BASE_URL}/api/surveys/1/demographics/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(createConfigData)
        });

        if (createConfigResponse.ok) {
            const createConfigResult = await createConfigResponse.json();
            console.log('✅ Success:', createConfigResult.success);
            console.log('📝 Message:', createConfigResult.message);
        } else {
            console.log('❌ Failed:', createConfigResponse.status, createConfigResponse.statusText);
            const errorData = await createConfigResponse.json();
            console.log('📝 Error:', errorData.error);
        }

        console.log('\n🎉 API Testing Complete!');

    } catch (error) {
        console.error('💥 Test failed with error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the development server is running:');
            console.log('   npm run dev');
        }
    }
}

// Wait a bit for server to be ready, then run tests
setTimeout(testAPI, 3000); 