import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createServer } from "http";
import { Server } from "socket.io";
import reporteRoutes from "./routes/reporte.routes"; 
import usuarioRoutes from "./routes/usuario.routes";

dotenv.config();

const app = express();
const httpServer = createServer(app); // 👈 Servidor HTTP para WebSockets
const io = new Server(httpServer, {
  cors: {
    origin: "*", // En producción, cámbialo a tu dominio
    methods: ["GET", "POST"]
  }
}); // 👈 WebSocket server

app.use(cors());
app.use(express.json());

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log("🔥 MongoDB conectado"))
  .catch(err => console.log("❌ Error MongoDB:", err));

// Middleware para pasar io a las rutas (opcional, lo usaremos en reporteRoutes)
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// Rutas
app.use("/api/reportes", reporteRoutes);
app.use("/api/usuarios", usuarioRoutes);

app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

// WebSockets - conexiones
io.on('connection', (socket) => {
  console.log('🟢 Cliente conectado a WebSockets:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔴 Cliente desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;

// 👈 IMPORTANTE: Usar httpServer.listen, NO app.listen
httpServer.listen(PORT, () => {
  console.log(`Servidor HTTP con WebSockets corriendo en puerto ${PORT}`);
});

// Exportamos io para usarlo en otras rutas
export { io };