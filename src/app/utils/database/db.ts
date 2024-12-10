import { Database} from "sqlite3";
import { open } from "sqlite";

export const openDb = async () => {
    return open({
        filename: process.env.DB_URL || '../../../db/app.db',
        driver: Database,
    });
};