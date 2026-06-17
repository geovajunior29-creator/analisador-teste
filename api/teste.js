module.exports = (req, res) => {
  res.status(200).json({ ok: true, message: 'Funcionando!', timestamp: Date.now() });
};
