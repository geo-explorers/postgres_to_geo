import dotenv from "dotenv";

dotenv.config();

const PK = process.env.PK;

if (!PK) {
	throw new Error("PK does not exist in environment");
}

const RPC = process.env.RPC;

if (!RPC) {
	throw new Error("RPC does not exist in environment");
}

const W_ADDRESS = process.env.W_ADDRESS;

if (!W_ADDRESS) {
	throw new Error("RPC does not exist in environment");
}

const SW_ADDRESS = process.env.SW_ADDRESS;

if (!SW_ADDRESS) {
	throw new Error("RPC does not exist in environment");
}

export const config = {
	pk: PK,
	rpc: RPC,
	SW_ADDRESS,
	W_ADDRESS
};
