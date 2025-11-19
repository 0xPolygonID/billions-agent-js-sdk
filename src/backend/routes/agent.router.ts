import express from "express";
import AgentController from "../controllers/agent.controller";

const agentRouter = express.Router();

agentRouter.post("/completions", AgentController.generateAnswer);

export default agentRouter;
