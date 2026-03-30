import Application from "../models/Application.js";

const saveApplication = async (req, res) => {
  try {
    const app = await Application.create(req.body);
    res.status(201).json(app);
  } catch (err) {
    console.error("❌ Error saving application:", err.message);
    res.status(500).json({ error: "Failed to save application" });
  }
};

const getApplications = async (req, res) => {
  try {
    const apps = await Application.find();
    res.status(200).json(apps);
  } catch (err) {
    console.error("❌ Error fetching applications:", err.message);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const updated = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("❌ Update error:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
};

export { saveApplication, getApplications, updateApplicationStatus };