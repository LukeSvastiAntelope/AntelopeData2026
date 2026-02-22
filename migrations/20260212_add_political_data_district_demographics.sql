CREATE TABLE IF NOT EXISTS political_data_district_demographics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state CHAR(2) NOT NULL,
  district_number SMALLINT NOT NULL,
  district_code VARCHAR(10) NOT NULL,
  total_population INT NULL,
  median_household_income INT NULL,
  bachelors_or_higher_pct DECIMAL(5,2) NULL,
  median_age DECIMAL(5,2) NULL,
  source_year SMALLINT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_district_demographics_code (district_code),
  KEY idx_district_demographics_state_district (state, district_number)
);
