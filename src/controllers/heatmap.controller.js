const { getHeatmapDataset } = require('../services/heatmap.service');

const getParkingHeatmap = async (_request, response, next) => {
  try {
    const points = await getHeatmapDataset();
    response.status(200).json(points);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getParkingHeatmap
};
