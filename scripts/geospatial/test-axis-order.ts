/**
 * Unit check: MySQL SRID 4326 axis order (lat then lng in WKT).
 *
 *   npx tsx --tsconfig tsconfig.json -r dotenv/config scripts/geospatial/test-axis-order.ts
 */

import mysql from 'mysql2/promise';
import {
  pointWkt4326,
  polygonWkt4326FromLngLatRing,
} from '../../src/app/utils/services/geo/spatial';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    // SF Market St ≈ 37.7793, -122.4192
    // Small box around it in MapLibre [lng,lat] order
    const ring: [number, number][] = [
      [-122.425, 37.775],
      [-122.415, 37.775],
      [-122.415, 37.783],
      [-122.425, 37.783],
      [-122.425, 37.775],
    ];
    const polyWkt = polygonWkt4326FromLngLatRing(ring);
    const insideWkt = pointWkt4326(37.7793, -122.4192);
    const outsideWkt = pointWkt4326(37.8, -122.4);

    const [rows]: any = await conn.query(
      `SELECT
         ST_Contains(ST_GeomFromText(?, 4326), ST_GeomFromText(?, 4326)) AS inside,
         ST_Contains(ST_GeomFromText(?, 4326), ST_GeomFromText(?, 4326)) AS outside`,
      [polyWkt, insideWkt, polyWkt, outsideWkt]
    );

    const inside = Number(rows[0].inside);
    const outside = Number(rows[0].outside);
    console.log({ polyWkt, insideWkt, outsideWkt, inside, outside });

    if (inside !== 1) {
      throw new Error(`Expected inside=1, got ${inside} — axis order likely wrong`);
    }
    if (outside !== 0) {
      throw new Error(`Expected outside=0, got ${outside}`);
    }
    console.log('PASS: SRID 4326 lat-lng WKT containment OK');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
