# Survey System Testing Checklist

## ✅ **CRITICAL BUGS FIXED** 
1. **Survey Creation API Transaction Error** - ✅ Fixed `db.rollback is not a function` error
2. **Question Type Data Truncation** - ✅ Fixed ENUM mismatch between frontend and database
3. **Complete Flow Tested** - ✅ End-to-end survey creation, response, and digital twin querying working

## 🚀 Quick Start Testing

### Prerequisites
1. **Database Setup**: Ensure survey tables are created (`node setup_survey_tables.js`)
2. **Server Running**: `npm run dev` on port 3000
3. **Authentication**: Have a valid user session for protected routes
4. **✅ Bug Fixes Verified**: All critical API issues resolved

---

## 📋 Manual Testing Checklist

### 1. **✅ VERIFIED: Core API Functionality** 
- [x] **Database connectivity** - Working
- [x] **Survey creation in database** - Working  
- [x] **Public survey access** - Working
- [x] **Survey response submission** - Working
- [x] **Digital twin creation** - Working
- [x] **Digital twin querying** - Working
- [x] **Error handling** - Working

### 2. **🔥 PRIORITY: Frontend UI Testing** 
- [ ] **Test survey creation through UI** - `/create/survey` → create → save/publish
- [ ] **Verify no errors in browser console** - Check for JavaScript errors
- [ ] **Confirm survey saves to database** - Check surveys table
- [ ] **Test with different question types** - text, single-choice, multiple-choice, rating, yes-no

### 3. **Navigation & Access** ✅
- [ ] Visit `/create` - Survey option appears with pink Users icon
- [ ] Click "Survey / Questionnaire" - Navigates to `/create/survey`
- [ ] Page loads without errors
- [ ] Sidebar and header render correctly

### 4. **Survey Creation UI** ✅
- [ ] **Basic Info Section**
  - [ ] Title field accepts input
  - [ ] Description field accepts input
  - [ ] Public/Private toggle works
  - [ ] Form validation shows errors for empty required fields

- [ ] **Question Builder**
  - [ ] "Add Question" button works
  - [ ] Question type dropdown shows all options (text, single_choice, multiple_choice, rating, yes_no)
  - [ ] Question text field accepts input
  - [ ] Required toggle works
  - [ ] Options field appears for choice questions
  - [ ] Scale field appears for rating questions
  - [ ] Delete question button works

- [ ] **Preview Mode**
  - [ ] Preview toggle shows/hides preview
  - [ ] Preview renders questions correctly
  - [ ] All question types display properly

- [ ] **Save/Publish**
  - [ ] Save as Draft button works
  - [ ] Publish Survey button works
  - [ ] Success message appears
  - [ ] Redirects appropriately

### 5. **Public Survey Display** ✅
- [ ] **Access Survey**
  - [ ] Visit `/survey/[slug]` for published survey
  - [ ] Page loads without authentication
  - [ ] Survey title and description display
  - [ ] Questions render in correct order

- [ ] **Demographics Form**
  - [ ] Age field accepts input
  - [ ] Gender dropdown works
  - [ ] Location field accepts input
  - [ ] Occupation field accepts input

- [ ] **Question Interactions**
  - [ ] Text inputs work
  - [ ] Radio buttons work (single choice)
  - [ ] Checkboxes work (multiple choice)
  - [ ] Rating scale works
  - [ ] Yes/No buttons work
  - [ ] Required field validation works

- [ ] **Form Submission**
  - [ ] Submit button works
  - [ ] Loading state shows
  - [ ] Success page displays
  - [ ] Digital twin token is shown
  - [ ] Copy token button works

### 6. **Custom Components** ✅
- [ ] **Radio Group Component**
  - [ ] Single selection works
  - [ ] Visual feedback on selection
  - [ ] Keyboard navigation works
  - [ ] Styling matches design system

- [ ] **Checkbox Component**
  - [ ] Multiple selection works
  - [ ] Check/uncheck animations
  - [ ] Proper spacing and alignment
  - [ ] Accessible labels

### 7. **Responsive Design** 📱
- [ ] **Mobile (320px-768px)**
  - [ ] Survey creation form is usable
  - [ ] Questions stack properly
  - [ ] Buttons are touch-friendly
  - [ ] Text is readable

- [ ] **Tablet (768px-1024px)**
  - [ ] Layout adapts appropriately
  - [ ] Form elements are properly sized
  - [ ] Navigation works

- [ ] **Desktop (1024px+)**
  - [ ] Full layout displays correctly
  - [ ] Optimal use of screen space
  - [ ] Hover states work

### 8. **Error Handling** 🚨
- [ ] **Network Errors**
  - [ ] Graceful handling of API failures
  - [ ] User-friendly error messages
  - [ ] Retry mechanisms where appropriate

- [ ] **Validation Errors**
  - [ ] Required field validation
  - [ ] Format validation (email, etc.)
  - [ ] Clear error messaging
  - [ ] Error state styling

- [ ] **Edge Cases**
  - [ ] Very long survey titles/descriptions
  - [ ] Many questions (10+ questions)
  - [ ] Special characters in inputs
  - [ ] Empty option lists

---

## 🔧 Automated Testing

### Run the Test Suite
```bash
# Install dependencies if needed
npm install mysql2

# Update database config in test file
# Edit test_survey_system.js - update dbConfig and TEST_USER_ID

# Run comprehensive tests
node test_survey_system.js
```

### Expected Test Results
- ✅ Database connection successful
- ✅ Survey creation works
- ✅ Public survey access works
- ✅ Survey response submission works
- ✅ Digital twin creation works
- ✅ Agent querying works
- ✅ Error handling works
- ✅ Data integrity maintained

---

## 🎯 Critical User Flows

### Flow 1: Create and Publish Survey
1. Login → `/create` → "Survey / Questionnaire"
2. Fill survey details
3. Add 3-5 questions of different types
4. Preview survey
5. Publish survey
6. Verify survey appears in listings

### Flow 2: Complete Survey Response
1. Visit public survey URL (no login)
2. Fill demographics
3. Answer all questions
4. Submit response
5. Receive digital twin token
6. Copy/save token

### Flow 3: Query Digital Twin
1. Use agent token from Flow 2
2. Send various queries to `/api/agents/query`
3. Verify responses are contextual
4. Test different question types

---

## 🔍 Performance Testing

### Load Testing
- [ ] 10+ concurrent survey submissions
- [ ] Large surveys (20+ questions)
- [ ] Multiple digital twin queries
- [ ] Database performance under load

### Response Times
- [ ] Survey creation < 2 seconds
- [ ] Public survey load < 1 second
- [ ] Response submission < 3 seconds
- [ ] Digital twin query < 5 seconds

---

## 🛡️ Security Testing

### Authentication
- [ ] Protected routes require valid tokens
- [ ] Public routes work without auth
- [ ] Token expiration handled properly

### Input Validation
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Input sanitization
- [ ] File upload restrictions (if any)

### Data Privacy
- [ ] Survey responses are private
- [ ] Digital twin tokens are unique
- [ ] No data leakage between surveys

---

## 📊 Browser Compatibility

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] Chrome Mobile
- [ ] Safari Mobile
- [ ] Samsung Internet
- [ ] Firefox Mobile

---

## ✅ Sign-off Criteria

**Ready for Production when:**
- [ ] All manual tests pass
- [ ] Automated test suite passes
- [ ] No critical bugs found
- [ ] Performance meets requirements
- [ ] Security review complete
- [ ] Cross-browser testing complete
- [ ] Mobile responsiveness verified

---

## 🐛 Bug Reporting Template

```
**Bug Title**: [Brief description]
**Severity**: Critical/High/Medium/Low
**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Result**: 
**Actual Result**: 
**Browser/Device**: 
**Screenshots**: [If applicable]
**Additional Notes**: 
```

---

## 📈 Next Steps After Testing

1. **Performance Optimization**: Based on load test results
2. **UI/UX Improvements**: Based on user feedback
3. **Additional Features**: AI survey generation, analytics
4. **Integration**: Connect with existing prediction system
5. **Monitoring**: Set up error tracking and analytics 