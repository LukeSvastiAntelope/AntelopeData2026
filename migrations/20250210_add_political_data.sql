-- Political data tables for dashboard map layers
-- Sources: Cook PVI, FEC, MIT Election Lab, Census

CREATE TABLE IF NOT EXISTS political_data_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state CHAR(2) NOT NULL UNIQUE,
  state_name VARCHAR(50),
  cook_pvi VARCHAR(10),
  cook_pvi_numeric DECIMAL(5,2),
  electoral_votes TINYINT,
  total_donations_dem BIGINT DEFAULT 0,
  total_donations_rep BIGINT DEFAULT 0,
  margin_2024 DECIMAL(5,2),
  governor_party CHAR(1),
  senate_seats VARCHAR(10),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS political_data_districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state CHAR(2) NOT NULL,
  district_number SMALLINT NOT NULL,
  district_code VARCHAR(10) NOT NULL,
  cook_pvi VARCHAR(10),
  cook_pvi_numeric DECIMAL(5,2),
  incumbent_name VARCHAR(100),
  incumbent_party CHAR(1),
  margin_2024 DECIMAL(5,2),
  total_donations_dem BIGINT DEFAULT 0,
  total_donations_rep BIGINT DEFAULT 0,
  total_donations_other BIGINT DEFAULT 0,
  registered_voters INT,
  turnout_2024 DECIMAL(5,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_district (state, district_number)
);

CREATE TABLE IF NOT EXISTS political_data_counties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state CHAR(2) NOT NULL,
  county_fips CHAR(5) NOT NULL,
  county_name VARCHAR(100),
  margin_2024 DECIMAL(5,2),
  margin_2020 DECIMAL(5,2),
  swing DECIMAL(5,2),
  total_votes_2024 INT,
  registered_voters INT,
  median_income INT,
  population INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_county (state, county_fips)
);
