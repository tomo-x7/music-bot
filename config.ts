import "dotenv/config"

const TOKEN=process.env.TOKEN;
const VCID=Number.parseInt(process.env.VC??"-1");
if(TOKEN==null)throw new Error("TOKEN is not set");
if(VCID==null||VCID<0)throw new Error("VC is not set");

export const config= {TOKEN,VCID}