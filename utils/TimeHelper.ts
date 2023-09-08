class TimeHelper {
  static timer = (ms: number) =>
    new Promise((response) => setTimeout(response, ms));
}

export default TimeHelper;
