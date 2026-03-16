import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

interface Project {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
}

interface todo {
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: 'pending' | 'in-progress' | 'completed';
	priority: 'low' | 'medium' | 'high';
	createdAt: string;
	updatedAt: string;
}
// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Project Planner MCP Server",
		version: "1.0.0",
	});

	private get kv(): KVNamespace {
		//get function use get keyword cause it is a method and with using get we can call it like a property 
		return this.env.PROJECT_PLANNER
	}

	private async getProjectList(): Promise<Project[]> {
		const listData = await this.kv.get("project:list")
		return listData ? JSON.parse(listData) : [];
	}

	private async todoList(projectId: string): Promise<todo[]> {
		const listData = await this.kv.get(`project:${projectId}:todos`)
		return listData ? JSON.parse(listData) : [];
	}

	private async getTododByProjectId(projectId: string): Promise<todo[]> {
		const todoList = await this.todoList(projectId);
		for (const todo of todoList) {
			const todoData = await this.kv.get(`todo:${todo.id}`);
			if (todoData) {
				todoList.push(JSON.parse(todoData));
			}
		}
		return todoList;
	}
	async init() {

		// tool for creating a project
		this.server.tool(
			"create_project",
			"create a new project",
			{
				name: z.string().describe("The name of the project"),
				description: z.string().optional().describe("A brief description of the project"),
			},
			async (args) => {
				const { name, description } = args;
				// Here you would normally create the project in your database
				const newProject: Project = {
					id: crypto.randomUUID(),
					name,
					description: description || "",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
				await this.kv.put(`project:${newProject.id}`, JSON.stringify(newProject));
				const projectList = await this.getProjectList();
				projectList.push(newProject);
				await this.kv.put("project:list", JSON.stringify(projectList));
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(newProject, null, 2)
						}
					]
				};
			},

		)

		// tool for listing all projects
		this.server.tool("list_projects", "list all projects",
			{},
			async () => {
				const projectList = await this.getProjectList();
				const projects: Project[] = [];
				for (const project of projectList) {
					const projectData = await this.kv.get(`project:${project.id}`);
					if (projectData) {
						projects.push(JSON.parse(projectData));
					}
				}
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(projects, null, 2)
						}
					]
				};
			}
		);

		//get project details
		this.server.tool("get_project_details", "get details of a project",
			{
				projectId: z.string().describe("The ID of the project"),
			},
			async (args) => {
				const { projectId } = args;
				const projectData = await this.kv.get(`project:${projectId}`);
				if (!projectData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Project not found"
							}
						]
					};
				}
				const project = JSON.parse(projectData);
				const todoList = await this.getTododByProjectId(projectId);
				project.todos = todoList;
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(project, null, 2)
						}
					]
				};
			}
		);


		// tool for creating a todo
		this.server.tool("create_todo", "create a new todo for a project",
			{
				projectId: z.string().describe("The ID of the project"),
				title: z.string().describe("The title of the todo"),
				description: z.string().optional().describe("A brief description of the todo"),
				status: z.enum(['pending', 'in-progress', 'completed']).describe("The status of the todo"),
				priority: z.enum(['low', 'medium', 'high']).describe("The priority of the todo")
			},

			async (args) => {
				const { projectId, title, description, status, priority } = args;
				// Here you would normally create the todo in your database
				const projectData = await this.kv.get(`project:${projectId}`);

				if (!projectData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Project not found"
							}
						]
					};
				}

				const newTodo: todo = {
					id: crypto.randomUUID(),
					projectId,
					title,
					description: description || "",
					status,
					priority,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
				await this.kv.put(`todo:${newTodo.id}`, JSON.stringify(newTodo));
				const todoList = await this.todoList(projectId);
				todoList.push(newTodo);
				await this.kv.put(`project:${projectId}:todos`, JSON.stringify(todoList));
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(newTodo, null, 2)
						}
					]
				};
			})

		// tool for deleting a project
		this.server.tool("delete_project", "delete a project",
			{
				projectId: z.string().describe("The ID of the project"),
			},
			async (args) => {
				const { projectId } = args;
				const projectData = await this.kv.get(`project:${projectId}`);
				if (!projectData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Project not found"
							}
						]
					};
				}
				await this.kv.delete(`project:${projectId}`);
				const projectList = await this.getProjectList();
				const updatedProjectList = projectList.filter((project) => project.id !== projectId);
				await this.kv.put("project:list", JSON.stringify(updatedProjectList));
				return {
					content: [
						{
							type: "text" as const,
							text: "Project deleted successfully"
						}
					]
				};
			})

		//update todo
		this.server.tool("update_todo", "update a todo",
			{
				todoId: z.string().describe("The ID of the todo"),
				title: z.string().optional().describe("The title of the todo"),
				description: z.string().optional().describe("A brief description of the todo"),
				status: z.enum(['pending', 'in-progress', 'completed']).optional().describe("The status of the todo"),
				priority: z.enum(['low', 'medium', 'high']).optional().describe("The priority of the todo")
			},
			async (args) => {
				const { todoId, title, description, status, priority } = args;
				const todoData = await this.kv.get(`todo:${todoId}`);
				if (!todoData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Todo not found"
							}
						]
					};
				}
				const todo = JSON.parse(todoData);
				if (title) todo.title = title;
				if (description) todo.description = description;
				if (status) todo.status = status;
				if (priority) todo.priority = priority;
				todo.updatedAt = new Date().toISOString();
				await this.kv.put(`todo:${todoId}`, JSON.stringify(todo));
				const todoList = await this.todoList(todo.projectId);
				const updatedTodoList = todoList.map((t) => t.id === todoId ? todo : t);
				await this.kv.put(`project:${todo.projectId}:todos`, JSON.stringify(updatedTodoList));
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(todo, null, 2)
						}
					]
				};
			})

		//delete todo from a project
		this.server.tool("delete_todo", "delete a todo",
			{
				todoId: z.string().describe("The ID of the todo"),
			},
			async (args) => {
				const { todoId } = args;
				const todoData = await this.kv.get(`todo:${todoId}`);
				if (!todoData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Todo not found"
							}
						]
					};
				}
				const todo = JSON.parse(todoData);
				await this.kv.delete(`todo:${todoId}`);
				const todoList = await this.todoList(todo.projectId);
				const updatedTodoList = todoList.filter((t) => t.id !== todoId);
				await this.kv.put(`project:${todo.projectId}:todos`, JSON.stringify(updatedTodoList));
				return {
					content: [
						{
							type: "text" as const,
							text: "Todo deleted successfully"
						}
					]
				};
			})

		//get todo specific to its id
		this.server.tool("get_todo_details", "get details of a todo",
			{
				todoId: z.string().describe("The ID of the todo"),
			},
			async (args) => {
				const { todoId } = args;
				const todoData = await this.kv.get(`todo:${todoId}`);
				if (!todoData) {
					return {
						content: [
							{
								type: "text" as const,
								text: "Todo not found"
							}
						]
					};
				}
				const todo = JSON.parse(todoData);
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(todo, null, 2)
						}
					]
				};
			})
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
