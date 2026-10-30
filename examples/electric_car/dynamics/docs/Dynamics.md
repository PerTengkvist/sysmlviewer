# Dynamics

Dynamics of the electric car. VehicleModes is the state machine every scenario moves through. Each interaction is one use case drawn as a sequence: an actor asks, a controller decides, actuators act, and the driver gets an acknowledgement (dashed «reply» message). Lifelines carry the names of the logical parts, so the sequences and the logical architecture read as one model. Each interaction states the mode it starts in and the mode it ends in.
