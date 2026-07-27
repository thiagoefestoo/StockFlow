exports.ok = (res, data = {}, message = 'OK') => res.json({ success: true, message, data });
exports.okPaginated = (res, data = [], pagination = {}, message = 'OK') => res.json({ success: true, message, data, pagination });
exports.created = (res, data = {}, message = 'Criado com sucesso') => res.status(201).json({ success: true, message, data });
exports.fail = (res, status = 400, message = 'Erro na requisição', extra = {}) => res.status(status).json({ success: false, message, ...extra });
